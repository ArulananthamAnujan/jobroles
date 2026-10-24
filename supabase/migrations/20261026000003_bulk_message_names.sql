-- Bulk messages fill in each applicant's first name, as single messages already do in the browser.
begin;
create or replace function public.jp_bulk_move(ids uuid[],wanted text,note text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare x uuid; n integer:=0; first_name text;
begin
 if cardinality(ids) not between 1 and 200 then raise exception 'Choose between 1 and 200 applicants' using errcode='22023';end if;
 if wanted not in ('new','reviewed','shortlisted','interview','offer','hired','rejected') then raise exception 'Unknown stage' using errcode='22023';end if;
 foreach x in array ids loop
  perform private.jp_command('application.move',jsonb_build_object('id',x,'stage',wanted));
  if length(trim(coalesce(note,'')))>0 then
   select nullif(split_part(trim(coalesce(s.profile->>'full_name',p.full_name,'')),' ',1),'') into first_name
   from public.applications a left join public.application_snapshots s on s.application_id=a.id left join public.seeker_profiles p on p.user_id=a.seeker_id where a.id=x;
   perform private.jp_command('message.send',jsonb_build_object('id',x,'body',left(replace(trim(note),'{name}',coalesce(first_name,'there')),5000)));
  end if;
  n:=n+1;
 end loop;
 return jsonb_build_object('moved',n);
end $$;
commit;
