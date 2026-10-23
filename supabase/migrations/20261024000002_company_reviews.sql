-- Reviews of an employer's hiring process, written only by people who applied there. Every review is moderated
-- before it appears; authors stay anonymous to the public and to the employer, who may post one public reply.
begin;
create table public.company_reviews(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),author_id uuid not null references auth.users(id),
 rating smallint not null check(rating between 1 and 5),title text not null check(length(title) between 3 and 120),
 pros text not null check(length(pros) between 10 and 2000),cons text not null check(length(cons) between 10 and 2000),
 status text not null default 'pending' check(status in ('pending','published','rejected')),moderation_reason text,
 employer_response text check(employer_response is null or length(employer_response) between 10 and 2000),responded_at timestamptz,
 created_at timestamptz not null default now(),published_at timestamptz,unique(company_id,author_id)
);
alter table public.company_reviews enable row level security;
revoke all on public.company_reviews from anon,authenticated;
grant select(id,company_id,rating,title,pros,cons,status,employer_response,responded_at,created_at,published_at) on public.company_reviews to anon,authenticated;
create policy reviews_public on public.company_reviews for select to anon,authenticated using(status='published');
create policy reviews_author on public.company_reviews for select to authenticated using(author_id=(select auth.uid()));
create policy reviews_admin on public.company_reviews for select to authenticated using(private.is_admin());

create function public.jp_submit_review(company uuid,stars integer,headline text,good text,bad text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target uuid;
begin
 if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'Confirmed account required' using errcode='42501';end if;
 if not exists(select 1 from public.applications a join public.jobs j on j.id=a.job_id where j.company_id=company and a.seeker_id=actor and a.state<>'draft') then raise exception 'Only people who applied to this employer can review its hiring process' using errcode='42501';end if;
 if exists(select 1 from public.company_memberships where company_id=company and user_id=actor) then raise exception 'Employer team members cannot review their own company' using errcode='42501';end if;
 if stars not between 1 and 5 or length(trim(coalesce(headline,''))) not between 3 and 120 or length(trim(coalesce(good,''))) not between 10 and 2000 or length(trim(coalesce(bad,''))) not between 10 and 2000 then
  raise exception 'Give 1 to 5 stars, a title, and at least 10 characters for what went well and what could improve' using errcode='22023';end if;
 insert into public.company_reviews(company_id,author_id,rating,title,pros,cons) values(company,actor,stars,trim(headline),trim(good),trim(bad))
 on conflict(company_id,author_id) do update set rating=excluded.rating,title=excluded.title,pros=excluded.pros,cons=excluded.cons,status='pending',moderation_reason=null,published_at=null,created_at=now()
 returning id into target;
 return jsonb_build_object('id',target,'status','pending');
end $$;
create function public.jp_moderate_review(target uuid,decision text,reason text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Administrator required' using errcode='42501';end if;
 if decision not in ('publish','reject') or length(trim(coalesce(reason,'')))<3 then raise exception 'Choose publish or reject and record a reason' using errcode='22023';end if;
 update public.company_reviews set status=case when decision='publish' then 'published' else 'rejected' end,moderation_reason=trim(reason),published_at=case when decision='publish' then now() end where id=target and status='pending';
 if not found then raise exception 'Review is not awaiting moderation' using errcode='22023';end if;
 insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(auth.uid(),'review.'||decision,'company_review',target,trim(reason));
 return jsonb_build_object('ok',true);
end $$;
create function public.jp_respond_review(target uuid,reply text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.company_reviews%rowtype;
begin
 select * into r from public.company_reviews where id=target and status='published';
 if not found or not private.owner_permission(r.company_id) then raise exception 'Company owner required' using errcode='42501';end if;
 if length(trim(coalesce(reply,''))) not between 10 and 2000 then raise exception 'Write a reply of 10 to 2000 characters' using errcode='22023';end if;
 update public.company_reviews set employer_response=trim(reply),responded_at=now() where id=target;
 return jsonb_build_object('ok',true);
end $$;
-- Pending reviews for moderators, with no author identity.
create function public.jp_pending_reviews() returns table(id uuid,company_id uuid,company_name text,rating smallint,title text,pros text,cons text,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Administrator required' using errcode='42501';end if;
 return query select r.id,r.company_id,c.name,r.rating,r.title,r.pros,r.cons,r.created_at from public.company_reviews r join public.companies c on c.id=r.company_id where r.status='pending' order by r.created_at limit 100;
end $$;
create function public.jp_company_rating(company uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select case when count(*)=0 then null else jsonb_build_object('average',round(avg(rating),1),'count',count(*)) end from public.company_reviews where company_id=company and status='published'
$$;
revoke all on function public.jp_submit_review(uuid,integer,text,text,text),public.jp_moderate_review(uuid,text,text),public.jp_respond_review(uuid,text),public.jp_pending_reviews() from public,anon;
grant execute on function public.jp_submit_review(uuid,integer,text,text,text),public.jp_moderate_review(uuid,text,text),public.jp_respond_review(uuid,text),public.jp_pending_reviews() to authenticated;
grant execute on function public.jp_company_rating(uuid) to anon,authenticated;
commit;
