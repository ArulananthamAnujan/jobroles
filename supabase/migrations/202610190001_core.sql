-- Core marketplace schema. Not deployed; no application data is migrated by this file.
-- Payment, notifications and resume downloads intentionally remain disabled.
begin;
create schema if not exists private;
revoke all on schema private from public;
create type public.company_role as enum ('owner','recruiter','hiring_manager');
create type public.job_state as enum ('draft','pending_review','live','paused','closed','expired');
create type public.application_state as enum ('draft','submitted','withdrawn');
create type public.hiring_stage as enum ('new','reviewed','shortlisted','interview','offer','hired','rejected');
create table public.seeker_profiles (
 user_id uuid primary key references auth.users(id), full_name text not null,
 headline text not null default '', location text not null default '', skills text[] not null default '{}',
 searchable boolean not null default false, search_consent_at timestamptz,
 updated_at timestamptz not null default now(), check(not searchable or search_consent_at is not null)
);
create table public.companies (
 id uuid primary key default gen_random_uuid(), name text not null, about text not null default '',
 abn text, verified_at timestamptz, is_agency boolean not null default false,
 suspended_at timestamptz, created_at timestamptz not null default now()
);
create table public.company_memberships (
 company_id uuid not null references public.companies(id), user_id uuid not null references auth.users(id),
 role public.company_role not null, revoked_at timestamptz, primary key(company_id,user_id)
);
create table public.jobs (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
 title text not null check(length(title) between 1 and 140), description text not null,
 state public.job_state not null default 'draft', employment_type text not null,
 arrangement text not null check(arrangement in ('on_site','hybrid','remote')),
 visa_sponsorship boolean not null default false, salary_min numeric(14,2), salary_max numeric(14,2),
 salary_period text check(salary_period in ('hour','day','month','year')), currency char(3) not null default 'AUD',
 created_at timestamptz not null default now(), published_at timestamptz, expires_at timestamptz,
 check((salary_min is null and salary_max is null) or (salary_min is not null and salary_max is not null and salary_min>=0 and salary_max>=salary_min and salary_period is not null)),
 check(state<>'live' or (published_at is not null and expires_at is not null and expires_at>published_at))
);
create index jobs_company_state on public.jobs(company_id,state);
create table public.job_locations (
 id uuid primary key default gen_random_uuid(), job_id uuid not null references public.jobs(id) on delete cascade,
 label text not null, latitude double precision, longitude double precision,
 check(latitude between -90 and 90),check(longitude between -180 and 180)
);
create table public.job_assignments (
 job_id uuid not null references public.jobs(id),user_id uuid not null references auth.users(id),primary key(job_id,user_id)
);
create table public.screening_questions (
 id uuid primary key default gen_random_uuid(),job_id uuid not null references public.jobs(id),
 question text not null,required boolean not null default true,must_have boolean not null default false,
 expected_answer text,position integer not null default 0
);
create table public.resume_versions (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),
 version integer not null check(version>0),storage_key text not null unique,filename text not null,
 mime_type text not null check(mime_type in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
 created_at timestamptz not null default now(),unique(user_id,version)
);
create table public.applications (
 id uuid primary key default gen_random_uuid(),job_id uuid not null references public.jobs(id),
 seeker_id uuid not null references auth.users(id),state public.application_state not null default 'draft',
 stage public.hiring_stage not null default 'new',created_at timestamptz not null default now(),
 submitted_at timestamptz,withdrawn_at timestamptz,unique(job_id,seeker_id),
 check((state='draft' and submitted_at is null) or (state<>'draft' and submitted_at is not null)),
 check((state='withdrawn')=(withdrawn_at is not null))
);
create index applications_seeker on public.applications(seeker_id);
create index applications_job_stage on public.applications(job_id,stage);
create table public.application_drafts (
 application_id uuid primary key references public.applications(id),resume_version_id uuid references public.resume_versions(id),
 answers jsonb not null default '{}',cover_letter text not null default '',updated_at timestamptz not null default now()
);
create table public.application_snapshots (
 application_id uuid primary key references public.applications(id),resume_version_id uuid not null references public.resume_versions(id),
 profile jsonb not null,answers jsonb not null,cover_letter text not null,submitted_at timestamptz not null
);
create table public.application_stage_history (
 id uuid primary key default gen_random_uuid(),application_id uuid not null references public.applications(id),
 actor_id uuid not null references auth.users(id),from_state text not null,to_state text not null,reason text,
 created_at timestamptz not null default now()
);
create table public.application_views (
 id uuid primary key default gen_random_uuid(),application_id uuid not null references public.applications(id),
 viewer_id uuid not null references auth.users(id),viewed_at timestamptz not null default now()
);
create table public.application_notes (
 id uuid primary key default gen_random_uuid(),application_id uuid not null references public.applications(id),
 author_id uuid not null references auth.users(id),body text not null,rating smallint check(rating between 1 and 5),
 created_at timestamptz not null default now()
);
create table public.interviews (
 id uuid primary key default gen_random_uuid(),application_id uuid not null references public.applications(id),
 starts_at timestamptz not null,time_zone text not null,format text not null,cancelled_at timestamptz,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now()
);
create table public.saved_jobs (
 user_id uuid not null references auth.users(id),job_id uuid not null references public.jobs(id),
 created_at timestamptz not null default now(),primary key(user_id,job_id)
);
create table public.saved_searches (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),
 filters jsonb not null,frequency text not null check(frequency in ('daily','instant','off')),created_at timestamptz not null default now()
);
create table public.company_invitations (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),
 email text not null,role public.company_role not null check(role<>'owner'),token_hash text not null unique,
 expires_at timestamptz not null default now()+interval '7 days',accepted_at timestamptz,revoked_at timestamptz
);
create table public.company_verifications (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),
 reviewer_id uuid not null references auth.users(id),abn_matched boolean not null,
 evidence_type text not null check(evidence_type in ('domain_email','business_callback','document_review')),
 evidence_reference text not null,decision text not null check(decision in ('approved','rejected','more_information')),
 reason text not null,created_at timestamptz not null default now(),check(decision<>'approved' or abn_matched)
);
create table public.audit_log (
 id uuid primary key default gen_random_uuid(),actor_id uuid references auth.users(id),
 action text not null,entity_type text not null,entity_id uuid,reason text not null,created_at timestamptz not null default now()
);
create table private.outbox (
 id uuid primary key default gen_random_uuid(),event_type text not null,entity_id uuid not null,
 payload jsonb not null default '{}',attempts integer not null default 0,created_at timestamptz not null default now(),completed_at timestamptz
);
-- Small, non-exposed authorization helpers prevent recursive membership RLS.
-- They do not mutate rows and always evaluate current memberships, not user-editable JWT metadata.
create function private.can_read_job(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.jobs j join public.company_memberships m on m.company_id=j.company_id
 where j.id=target and m.user_id=(select auth.uid()) and m.revoked_at is null
 and (m.role='owner' or exists(select 1 from public.job_assignments a where a.job_id=j.id and a.user_id=m.user_id)));
$$;
create function private.can_read_application(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.applications a where a.id=target and
 (a.seeker_id=(select auth.uid()) or (a.state<>'draft' and private.can_read_job(a.job_id))));
$$;
create function private.can_read_notes(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.applications a where a.id=target and a.state<>'draft' and private.can_read_job(a.job_id));
$$;
revoke all on function private.can_read_job(uuid),private.can_read_application(uuid),private.can_read_notes(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.can_read_job(uuid),private.can_read_application(uuid),private.can_read_notes(uuid) to authenticated;
-- Enable RLS and revoke automatic grants on every table created by this migration.
do $$ declare t text;begin foreach t in array array['seeker_profiles','companies','company_memberships','jobs','job_locations','job_assignments','screening_questions','resume_versions','applications','application_drafts','application_snapshots','application_stage_history','application_views','application_notes','interviews','saved_jobs','saved_searches','company_invitations','company_verifications','audit_log'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 end loop;end $$;
alter table private.outbox enable row level security;
revoke all on private.outbox from public,anon,authenticated;
grant select on public.companies,public.jobs,public.job_locations,public.screening_questions to anon,authenticated;
grant select on public.seeker_profiles,public.company_memberships,public.job_assignments,public.resume_versions,public.applications,public.application_drafts,public.application_snapshots,public.application_stage_history,public.application_views,public.application_notes,public.interviews,public.saved_jobs,public.saved_searches to authenticated;
create policy companies_public on public.companies for select to anon,authenticated using(verified_at is not null and suspended_at is null);
create policy companies_member on public.companies for select to authenticated using(exists(select 1 from public.company_memberships m where m.company_id=id and m.user_id=(select auth.uid()) and m.revoked_at is null));
create policy membership_self on public.company_memberships for select to authenticated using(user_id=(select auth.uid()) and revoked_at is null);
create policy assignment_self on public.job_assignments for select to authenticated using(user_id=(select auth.uid()));
create policy jobs_public on public.jobs for select to anon,authenticated using(state='live' and expires_at>now() and exists(select 1 from public.companies c where c.id=company_id and c.verified_at is not null and c.suspended_at is null));
create policy jobs_member on public.jobs for select to authenticated using(private.can_read_job(id));
create policy locations_read on public.job_locations for select to anon,authenticated using(exists(select 1 from public.jobs j where j.id=job_id));
create policy screening_read on public.screening_questions for select to anon,authenticated using(exists(select 1 from public.jobs j where j.id=job_id));
create policy profile_self on public.seeker_profiles for select to authenticated using(user_id=(select auth.uid()));
create policy resumes_self on public.resume_versions for select to authenticated using(user_id=(select auth.uid()));
create policy applications_read on public.applications for select to authenticated using(private.can_read_application(id));
create policy drafts_self on public.application_drafts for select to authenticated using(exists(select 1 from public.applications a where a.id=application_id and a.seeker_id=(select auth.uid())));
create policy snapshots_read on public.application_snapshots for select to authenticated using(private.can_read_application(application_id));
create policy history_read on public.application_stage_history for select to authenticated using(private.can_read_application(application_id));
create policy views_read on public.application_views for select to authenticated using(private.can_read_application(application_id));
create policy notes_team_only on public.application_notes for select to authenticated using(private.can_read_notes(application_id));
create policy interviews_read on public.interviews for select to authenticated using(private.can_read_application(application_id));
create policy saved_jobs_self on public.saved_jobs for select to authenticated using(user_id=(select auth.uid()));
create policy saved_searches_self on public.saved_searches for select to authenticated using(user_id=(select auth.uid()));
-- No client write privileges yet. Atomic submission, lifecycle, invitation and moderation
-- RPCs must be implemented and tested before exposing writes; never grant unrestricted updates.
commit;
