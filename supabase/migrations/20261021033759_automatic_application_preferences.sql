-- Preferences only. Paid activation and automatic dispatch are deliberately unavailable.
create table public.application_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 mode text not null default 'manual' check(mode in ('manual','automatic')),
 criteria jsonb not null default '{}'::jsonb check(jsonb_typeof(criteria)='object' and octet_length(criteria::text)<=16000),
 resume_version_id uuid references public.resume_versions(id),
 setup_acknowledged boolean not null default false,
 sending_enabled boolean not null default false check(sending_enabled=false),
 updated_at timestamptz not null default now(),
 check(mode='manual' or (resume_version_id is not null and setup_acknowledged))
);
alter table public.application_preferences enable row level security;
revoke all on public.application_preferences from anon,authenticated;
grant select,insert,update,delete on public.application_preferences to authenticated;
create policy preference_read on public.application_preferences for select to authenticated using(user_id=(select auth.uid()));
create policy preference_insert on public.application_preferences for insert to authenticated with check(user_id=(select auth.uid()) and (resume_version_id is null or exists(select 1 from public.resume_versions r where r.id=resume_version_id and r.user_id=(select auth.uid()) and r.deleted_at is null)));
create policy preference_update on public.application_preferences for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and (resume_version_id is null or exists(select 1 from public.resume_versions r where r.id=resume_version_id and r.user_id=(select auth.uid()) and r.deleted_at is null)));
create policy preference_delete on public.application_preferences for delete to authenticated using(user_id=(select auth.uid()));
