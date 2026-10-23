-- Built-in video interviews. Browsers connect to each other directly (WebRTC); this only relays the short setup
-- messages between the applicant and the hiring team for an interview both can see. Rooms open 30 minutes before
-- the start time and close 3 hours after it. Media never passes through JobRoles.
begin;
create table public.interview_signals(
 id bigint generated always as identity primary key,interview_id uuid not null references public.interviews(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade,peer text not null check(length(peer) between 8 and 64),
 kind text not null check(kind in ('hello','offer','answer','candidate','bye')),payload jsonb not null default '{}'::jsonb check(octet_length(payload::text)<=20000),
 created_at timestamptz not null default now()
);
create index interview_signals_room on public.interview_signals(interview_id,id);
alter table public.interview_signals enable row level security;
revoke all on public.interview_signals from anon,authenticated;

create function private.video_room(target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare i public.interviews%rowtype; a public.applications%rowtype; side text;
begin
 select * into i from public.interviews where id=target;
 if not found or not private.can_read_application(i.application_id) then raise exception 'Interview unavailable' using errcode='42501';end if;
 select * into a from public.applications where id=i.application_id;
 side:=case when a.seeker_id=auth.uid() then 'candidate' else 'employer' end;
 if i.cancelled_at is not null then raise exception 'This interview was cancelled' using errcode='22023';end if;
 if now()<i.starts_at-interval '30 minutes' then raise exception 'The room opens 30 minutes before the interview' using errcode='22023';end if;
 if now()>i.starts_at+interval '3 hours' then raise exception 'This interview has finished' using errcode='22023';end if;
 return jsonb_build_object('side',side,'startsAt',i.starts_at,'timeZone',i.time_zone,
  'title',(select j.title||' at '||c.name from public.jobs j join public.companies c on c.id=j.company_id where j.id=a.job_id),
  'candidate',(select full_name from public.seeker_profiles where user_id=a.seeker_id));
end $$;
revoke all on function private.video_room(uuid) from public;

-- Details for the waiting room, available any time to participants (so they can test their camera early).
create function public.jp_video_room(target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare i public.interviews%rowtype; a public.applications%rowtype;
begin
 select * into i from public.interviews where id=target;
 if not found or auth.uid() is null or not private.can_read_application(i.application_id) then raise exception 'Interview unavailable' using errcode='42501';end if;
 select * into a from public.applications where id=i.application_id;
 return jsonb_build_object('side',case when a.seeker_id=auth.uid() then 'candidate' else 'employer' end,'startsAt',i.starts_at,'timeZone',i.time_zone,'format',i.format,'cancelled',i.cancelled_at is not null,
  'opensAt',i.starts_at-interval '30 minutes','closesAt',i.starts_at+interval '3 hours','applicationId',a.id,
  'title',(select j.title||' at '||c.name from public.jobs j join public.companies c on c.id=j.company_id where j.id=a.job_id));
end $$;
create function public.jp_video_signal(target uuid,peer_id text,signal_kind text,body jsonb) returns bigint language plpgsql security definer set search_path='' as $$
declare room jsonb:=private.video_room(target); new_id bigint;
begin
 if (select count(*) from public.interview_signals where interview_id=target and sender_id=auth.uid())>=2000 then raise exception 'Too many messages for this call' using errcode='22023';end if;
 insert into public.interview_signals(interview_id,sender_id,peer,kind,payload) values(target,auth.uid(),peer_id,signal_kind,coalesce(body,'{}'::jsonb)) returning id into new_id;
 return new_id;
end $$;
-- Messages from the other participants since the last one this browser saw.
create function public.jp_video_poll(target uuid,peer_id text,after_id bigint) returns table(id bigint,peer text,side text,kind text,payload jsonb)
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare room jsonb:=private.video_room(target); seeker uuid;
begin
 select a.seeker_id into seeker from public.interviews i join public.applications a on a.id=i.application_id where i.id=target;
 return query select s.id,s.peer,case when s.sender_id=seeker then 'candidate' else 'employer' end,s.kind,s.payload from public.interview_signals s
  where s.interview_id=target and s.id>coalesce(after_id,0) and s.peer<>peer_id and s.created_at>now()-interval '4 hours'
   and (s.kind in ('hello','bye') or s.payload->>'to'=peer_id)
  order by s.id limit 200;
end $$;
revoke all on function public.jp_video_room(uuid),public.jp_video_signal(uuid,text,text,jsonb),public.jp_video_poll(uuid,text,bigint) from public,anon;
grant execute on function public.jp_video_room(uuid),public.jp_video_signal(uuid,text,text,jsonb),public.jp_video_poll(uuid,text,bigint) to authenticated;
commit;
