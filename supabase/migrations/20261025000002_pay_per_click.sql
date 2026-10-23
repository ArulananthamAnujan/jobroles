-- Pay-per-click sponsored jobs. Employers buy prepaid advertising credit through Stripe, then run a campaign per
-- job with a daily budget and a cost per click. A sponsored role is lifted in search while the company has credit
-- and the job has budget left today; each click from a distinct visitor per day is charged once.
begin;
create table public.ad_credit_ledger(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id) on delete cascade,
 amount_cents integer not null check(amount_cents<>0),kind text not null check(kind in ('topup','click','refund','adjustment')),
 reference text not null unique,job_id uuid references public.jobs(id) on delete set null,actor_id uuid references auth.users(id) on delete set null,
 invoice_url text,created_at timestamptz not null default now()
);
create index ad_credit_company on public.ad_credit_ledger(company_id,created_at desc);
create table public.job_campaigns(
 job_id uuid primary key references public.jobs(id) on delete cascade,company_id uuid not null references public.companies(id) on delete cascade,
 daily_budget_cents integer not null check(daily_budget_cents between 500 and 100000),cpc_cents integer not null check(cpc_cents between 50 and 2000),
 active boolean not null default true,updated_by uuid references auth.users(id) on delete set null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(cpc_cents<=daily_budget_cents)
);
create table public.sponsored_clicks(
 id uuid primary key default gen_random_uuid(),job_id uuid not null references public.jobs(id) on delete cascade,visitor text not null check(length(visitor) between 16 and 128),
 day date not null default (now() at time zone 'Australia/Sydney')::date,cost_cents integer not null,created_at timestamptz not null default now(),unique(job_id,visitor,day)
);
create index sponsored_clicks_day on public.sponsored_clicks(job_id,day);
alter table public.ad_credit_ledger enable row level security;alter table public.job_campaigns enable row level security;alter table public.sponsored_clicks enable row level security;
revoke all on public.ad_credit_ledger,public.job_campaigns,public.sponsored_clicks from anon,authenticated;
grant select on public.ad_credit_ledger,public.job_campaigns to authenticated;
create policy ledger_team on public.ad_credit_ledger for select to authenticated using(exists(select 1 from public.company_memberships m where m.company_id=ad_credit_ledger.company_id and m.user_id=(select auth.uid()) and m.revoked_at is null and m.role in ('owner','recruiter')));
create policy campaigns_team on public.job_campaigns for select to authenticated using(exists(select 1 from public.company_memberships m where m.company_id=job_campaigns.company_id and m.user_id=(select auth.uid()) and m.revoked_at is null and m.role in ('owner','recruiter')));

create function private.ad_balance(company uuid) returns integer language sql stable security definer set search_path='' as $$
 select coalesce(sum(amount_cents),0)::integer from public.ad_credit_ledger where company_id=company
$$;
create function private.ad_spent_today(target uuid) returns integer language sql stable security definer set search_path='' as $$
 select coalesce(sum(cost_cents),0)::integer from public.sponsored_clicks where job_id=target and day=(now() at time zone 'Australia/Sydney')::date
$$;
revoke all on function private.ad_balance(uuid),private.ad_spent_today(uuid) from public;

-- Search keeps calling this: fixed-term sponsorships still count, and so do campaigns that can pay for a click now.
create or replace function public.jp_active_sponsorships(targets uuid[]) returns setof uuid language sql stable security definer set search_path='' as $$
 select job_id from public.job_sponsorships where job_id=any(targets) and now() between starts_at and ends_at
 union
 select c.job_id from public.job_campaigns c join public.jobs j on j.id=c.job_id
 where c.job_id=any(targets) and c.active and j.state='live' and j.expires_at>now()
  and private.ad_balance(c.company_id)>=c.cpc_cents and private.ad_spent_today(c.job_id)+c.cpc_cents<=c.daily_budget_cents
$$;

create function public.jp_set_campaign(target uuid,daily_budget integer,cpc integer,turn_on boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare j jsonb:=public.jp_can_sponsor(target);
begin
 if daily_budget not between 500 and 100000 or cpc not between 50 and 2000 or cpc>daily_budget then raise exception 'Set a daily budget of $5 to $1,000 and a cost per click of $0.50 to $20, no more than the daily budget' using errcode='22023';end if;
 insert into public.job_campaigns(job_id,company_id,daily_budget_cents,cpc_cents,active,updated_by) values(target,(j->>'companyId')::uuid,daily_budget,cpc,turn_on,auth.uid())
 on conflict(job_id) do update set daily_budget_cents=excluded.daily_budget_cents,cpc_cents=excluded.cpc_cents,active=excluded.active,updated_by=excluded.updated_by,updated_at=now();
 insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(auth.uid(),'campaign.'||case when turn_on then 'start' else 'pause' end,'job',target,format('budget %s, cpc %s',daily_budget,cpc));
 return jsonb_build_object('ok',true);
end $$;
-- Campaign view for the employer portal.
create function public.jp_ad_account(company uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.company_memberships m where m.company_id=company and m.user_id=auth.uid() and m.revoked_at is null and m.role in ('owner','recruiter')) then raise exception 'Employer access required' using errcode='42501';end if;
 return jsonb_build_object('balance',private.ad_balance(company),
  'jobs',coalesce((select jsonb_agg(jsonb_build_object('jobId',j.id,'title',j.title,'campaign',case when c.job_id is null then null else jsonb_build_object('dailyBudget',c.daily_budget_cents,'cpc',c.cpc_cents,'active',c.active) end,
    'spentToday',private.ad_spent_today(j.id),'clicks7',(select count(*) from public.sponsored_clicks s where s.job_id=j.id and s.day>(now() at time zone 'Australia/Sydney')::date-7),
    'spent7',(select coalesce(sum(cost_cents),0) from public.sponsored_clicks s where s.job_id=j.id and s.day>(now() at time zone 'Australia/Sydney')::date-7),
    'applications7',(select count(*) from public.applications a where a.job_id=j.id and a.state<>'draft' and a.submitted_at>now()-interval '7 days'),
    'showing',exists(select 1 from public.jp_active_sponsorships(array[j.id]))) order by j.published_at desc)
   from public.jobs j left join public.job_campaigns c on c.job_id=j.id where j.company_id=company and j.state='live' and j.expires_at>now()),'[]'::jsonb),
  'ledger',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'amount',l.amount_cents,'kind',l.kind,'createdAt',l.created_at,'invoiceUrl',l.invoice_url) order by l.created_at desc)
   from (select * from public.ad_credit_ledger where company_id=company and kind<>'click' order by created_at desc limit 50) l),'[]'::jsonb));
end $$;
-- Called by the ad-click worker with a per-day visitor fingerprint. Charges once per visitor, job and day.
create function public.jp_record_sponsored_click(target uuid,visitor_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.job_campaigns%rowtype; click uuid;
begin
 select * into c from public.job_campaigns where job_id=target for update;
 if not found or not exists(select 1 from public.jp_active_sponsorships(array[target])) or exists(select 1 from public.job_sponsorships where job_id=target and now() between starts_at and ends_at) then return jsonb_build_object('charged',false);end if;
 if not c.active or private.ad_balance(c.company_id)<c.cpc_cents or private.ad_spent_today(target)+c.cpc_cents>c.daily_budget_cents then return jsonb_build_object('charged',false);end if;
 insert into public.sponsored_clicks(job_id,visitor,cost_cents) values(target,visitor_key,c.cpc_cents) on conflict do nothing returning id into click;
 if click is null then return jsonb_build_object('charged',false);end if;
 insert into public.ad_credit_ledger(company_id,amount_cents,kind,reference,job_id) values(c.company_id,-c.cpc_cents,'click','click:'||click,target);
 return jsonb_build_object('charged',true,'cost',c.cpc_cents);
end $$;
-- Stripe webhook records a paid top-up once per checkout session.
create function public.jp_record_ad_credit(session text,company uuid,buyer uuid,amount integer) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if amount<=0 then raise exception 'Invalid amount' using errcode='22023';end if;
 insert into public.ad_credit_ledger(company_id,amount_cents,kind,reference,actor_id) values(company,amount,'topup',session,buyer) on conflict(reference) do nothing;
 return jsonb_build_object('balance',private.ad_balance(company));
end $$;
create function public.jp_set_credit_invoice(session text,url text) returns void language sql security definer set search_path='' as $$
 update public.ad_credit_ledger set invoice_url=url where reference=session and url ~ '^https://'
$$;
create function public.jp_can_buy_credit(company uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.company_memberships m join public.companies c on c.id=m.company_id where m.company_id=company and m.user_id=auth.uid() and m.revoked_at is null and m.role in ('owner','recruiter') and c.verified_at is not null) then
  raise exception 'Owners and recruiters of verified employers can buy advertising credit' using errcode='42501';end if;
 return jsonb_build_object('companyId',company,'name',(select name from public.companies where id=company));
end $$;
revoke all on function public.jp_set_campaign(uuid,integer,integer,boolean),public.jp_ad_account(uuid),public.jp_can_buy_credit(uuid) from public,anon;
grant execute on function public.jp_set_campaign(uuid,integer,integer,boolean),public.jp_ad_account(uuid),public.jp_can_buy_credit(uuid) to authenticated;
revoke all on function public.jp_record_sponsored_click(uuid,text),public.jp_record_ad_credit(text,uuid,uuid,integer),public.jp_set_credit_invoice(text,text) from public,anon,authenticated;
grant execute on function public.jp_record_sponsored_click(uuid,text),public.jp_record_ad_credit(text,uuid,uuid,integer),public.jp_set_credit_invoice(text,text) to service_role;
commit;
