-- Real ABN checks. Until now a company was verified when its ABN merely had the right check digits, which proves
-- the number is well formed, not that the business exists. With this update the database asks the Australian
-- Business Register (ABR, abr.business.gov.au) about each new company's ABN and verifies it only when:
--   * the register says the ABN is Active, and
--   * the name on the register (legal name or a registered business name) matches the company name given here, and
--   * no other company on the site uses the same ABN.
-- Anything else (cancelled ABN, a different business's ABN, register unavailable) waits for an administrator, and
-- the employer is told why.
--
-- The register needs a free access key ("GUID"). Until one is saved (see docs/ABN-CHECK.md) the old check-digit
-- rule stays in force so the site keeps working, and Admin > Setup status says the register is not connected.
begin;

create table private.app_settings(key text primary key,value text not null,updated_at timestamptz not null default now());
create table private.abn_checks(
 abn text primary key check(abn ~ '^\d{11}$'),status text not null,entity_name text not null default '',business_names text[] not null default '{}',
 entity_type text not null default '',state text not null default '',postcode text not null default '',message text not null default '',
 attempts int not null default 1,checked_at timestamptz not null default now());

-- The web request, on its own so it can be swapped in tests. Returns the register's raw answer, or null if it could not be reached.
create function private.abr_fetch(abn text,guid text) returns text language plpgsql security definer set search_path='' as $$
declare body text;
begin
 perform extensions.http_set_curlopt('CURLOPT_TIMEOUT','8');
 select content into body from extensions.http_get('https://abr.business.gov.au/json/AbnDetails.aspx?abn='||abn||'&guid='||guid);
 return body;
exception when others then return null;
end $$;
revoke all on function private.abr_fetch(text,text) from public;

-- Asks the register about one ABN and remembers the answer. A failed attempt is retried after ten minutes.
create function private.abr_lookup(target text) returns private.abn_checks language plpgsql security definer set search_path='' as $$
declare guid text;body text;j jsonb;r private.abn_checks;
begin
 select value into guid from private.app_settings where key='abr_guid';
 if guid is null or not private.valid_abn(target) then return null;end if;
 select * into r from private.abn_checks where abn=target;
 if found and (r.status<>'error' or r.checked_at>now()-interval '10 minutes') then return r;end if;
 body:=private.abr_fetch(target,guid);
 begin j:=substring(body from '\((.*)\)\s*;?\s*$')::jsonb;exception when others then j:=null;end;
 if j is null then
  insert into private.abn_checks(abn,status,message) values(target,'error','The ABN register could not be reached')
  on conflict(abn) do update set status='error',message=excluded.message,attempts=private.abn_checks.attempts+1,checked_at=now() returning * into r;
 elsif coalesce(j->>'Abn','')='' then
  -- An empty answer with a message about the access key is our problem, not the employer's: try again later.
  insert into private.abn_checks(abn,status,message) values(target,case when j->>'Message' ilike '%guid%' then 'error' else 'not_found' end,left(coalesce(j->>'Message',''),300))
  on conflict(abn) do update set status=excluded.status,message=excluded.message,attempts=private.abn_checks.attempts+1,checked_at=now() returning * into r;
 else
  insert into private.abn_checks(abn,status,entity_name,business_names,entity_type,state,postcode,message)
  values(target,case when lower(j->>'AbnStatus')='active' then 'active' else 'cancelled' end,left(coalesce(j->>'EntityName',''),300),
   coalesce(array(select left(x,300) from jsonb_array_elements_text(case when jsonb_typeof(j->'BusinessName')='array' then j->'BusinessName' else '[]'::jsonb end) x limit 50),'{}'),
   left(coalesce(j->>'EntityTypeName',''),120),left(coalesce(j->>'AddressState',''),10),left(coalesce(j->>'AddressPostcode',''),10),left(coalesce(j->>'Message',''),300))
  on conflict(abn) do update set status=excluded.status,entity_name=excluded.entity_name,business_names=excluded.business_names,entity_type=excluded.entity_type,
   state=excluded.state,postcode=excluded.postcode,message=excluded.message,attempts=private.abn_checks.attempts+1,checked_at=now() returning * into r;
 end if;
 return r;
end $$;
revoke all on function private.abr_lookup(text) from public;

-- Do two names plausibly refer to the same business? Compares the distinctive words, ignoring "Pty Ltd", "The",
-- "Australia" and similar. "Kumar Building Supplies" matches "KUMAR BUILDING SUPPLIES PTY LTD" and "Kumar Supplies",
-- but not "Smith Plumbing".
create function private.name_words(name text) returns text[] language sql immutable set search_path='' as $$
 select coalesce(array_agg(distinct w),'{}') from regexp_split_to_table(lower(regexp_replace(coalesce(name,''),'[^a-zA-Z0-9]+',' ','g')),' ') w
 where length(w)>=3 and w not in ('pty','ltd','limited','proprietary','the','and','for','trust','trustee','trustees','company','group','holdings','australia','australian','aust','services','service','solutions','enterprises','international','inc','incorporated','corporation','corp','partners','partnership','family')
$$;
create function private.names_match(given text,registered text[]) returns boolean language sql immutable set search_path='' as $$
 select exists(select 1 from unnest(registered) r where private.name_words(given) && private.name_words(r))
$$;

create or replace function private.auto_approve() returns jsonb language plpgsql security definer set search_path='' as $$
declare companies_done int:=0;jobs_done int;c record;r private.abn_checks;lookups int:=0;use_register boolean;
begin
 use_register:=exists(select 1 from private.app_settings where key='abr_guid');
 for c in select id,name,abn from public.companies co
  where co.verified_at is null and co.suspended_at is null and not coalesce(co.sourced,false) and co.created_at<=now()-interval '1 minute'
   and private.valid_abn(co.abn) and not exists(select 1 from public.companies o where o.abn=co.abn and o.id<>co.id)
  order by co.created_at limit 20
 loop
  if use_register then
   -- At most three new questions to the register per run, so one run never takes long.
   if not exists(select 1 from private.abn_checks k where k.abn=c.abn and (k.status<>'error' or k.checked_at>now()-interval '10 minutes')) then
    exit when lookups>=3;lookups:=lookups+1;
   end if;
   r:=private.abr_lookup(c.abn);
   continue when r.abn is null or r.status<>'active' or not private.names_match(c.name,array[r.entity_name]||r.business_names);
   update public.companies set verified_at=now() where id=c.id;
   insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(null,'company.auto_verified','company',c.id,left('ABN register: active, registered to '||r.entity_name,400));
  else
   update public.companies set verified_at=now() where id=c.id;
   insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(null,'company.auto_verified','company',c.id,'ABN has valid check digits and is not used by another company (ABN register not connected)');
  end if;
  companies_done:=companies_done+1;
 end loop;

 with done as (
  update public.jobs j set state='live',published_at=now(),expires_at=now()+interval '30 days'
  from public.companies co
  where co.id=j.company_id and j.state='pending_review' and coalesce(j.review_requested_at,j.created_at)<=now()-interval '1 minute'
   and co.verified_at is not null and co.suspended_at is null and not co.is_agency
   and not exists(select 1 from private.job_risk k where k.job_id=j.id and cardinality(k.flags)>0)
  returning j.id),
 logged as (insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) select null,'job.auto_approved','job',id,'Verified employer, no risk flags, one minute after it was sent for approval' from done returning entity_id),
 queued as (insert into private.outbox(event_type,entity_id) select 'job.reviewed',entity_id from logged returning 1)
 select count(*) into jobs_done from queued;
 return jsonb_build_object('companies',companies_done,'jobs',jobs_done);
end $$;

-- What a company's own team (and administrators) see about its ABN check, in plain words.
create function public.jp_abn_check(company uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.companies;r private.abn_checks;connected boolean;
begin
 if not (private.is_admin() or exists(select 1 from public.company_memberships m where m.company_id=company and m.user_id=auth.uid() and m.revoked_at is null)) then raise exception 'Company not found' using errcode='42501';end if;
 select * into c from public.companies where id=company;
 connected:=exists(select 1 from private.app_settings where key='abr_guid');
 select * into r from private.abn_checks where abn=c.abn;
 return jsonb_build_object('verified',c.verified_at is not null,'abn',c.abn,'registeredName',nullif(r.entity_name,''),
  'state',case
   when c.verified_at is not null then 'verified'
   when c.abn is null then 'no_abn'
   when not private.valid_abn(c.abn) then 'invalid'
   when exists(select 1 from public.companies o where o.abn=c.abn and o.id<>c.id) then 'duplicate'
   when not connected or r.abn is null or r.status='error' then 'checking'
   when r.status='not_found' then 'not_found'
   when r.status='cancelled' then 'cancelled'
   when not private.names_match(c.name,array[r.entity_name]||r.business_names) then 'name_mismatch'
   else 'checking' end);
end $$;
revoke all on function public.jp_abn_check(uuid) from public,anon;
grant execute on function public.jp_abn_check(uuid) to authenticated;

-- Administrators: connect the register (save or replace the access key), and see whether it is connected and working.
create function public.jp_set_abn_register_key(guid text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Administrator required' using errcode='42501';end if;
 if trim(coalesce(guid,''))='' then delete from private.app_settings where key='abr_guid';return jsonb_build_object('connected',false);end if;
 if trim(guid) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'That does not look like an ABN Lookup GUID' using errcode='22023';end if;
 insert into private.app_settings(key,value) values('abr_guid',trim(guid)) on conflict(key) do update set value=excluded.value,updated_at=now();
 -- Earlier failures may have been caused by a missing or wrong key: let them be tried again straight away.
 delete from private.abn_checks where status='error';
 insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(auth.uid(),'settings.abn_register',  'settings',null,'ABN register access key saved');
 return jsonb_build_object('connected',true);
end $$;
create function public.jp_abn_register_status() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Administrator required' using errcode='42501';end if;
 return jsonb_build_object('connected',exists(select 1 from private.app_settings where key='abr_guid'),
  'canReach',exists(select 1 from pg_extension where extname='http'),
  'checked',(select count(*) from private.abn_checks where status<>'error'),
  'failing',(select count(*) from private.abn_checks where status='error'),
  'lastError',(select message from private.abn_checks where status='error' order by checked_at desc limit 1),
  'waiting',(select count(*) from public.companies where verified_at is null and suspended_at is null and not coalesce(sourced,false) and abn is not null));
end $$;
revoke all on function public.jp_set_abn_register_key(text),public.jp_abn_register_status() from public,anon;
grant execute on function public.jp_set_abn_register_key(text),public.jp_abn_register_status() to authenticated;

-- Lets the database make the web request. Available on Supabase; where it is not, the register simply stays unreachable.
do $$ begin create extension if not exists http with schema extensions;exception when others then raise notice 'The http extension is not available here (%).',sqlerrm;end $$;
commit;
