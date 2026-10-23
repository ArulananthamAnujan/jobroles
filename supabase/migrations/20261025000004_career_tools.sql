-- Career tools: a full profile that builds a resume, skills assessments scored in the database, hiring events,
-- and hiding jobs a seeker is not interested in.
begin;

-- Profile and resume builder ----------------------------------------------------------------------------------
alter table public.seeker_profiles add column summary text not null default '' check(length(summary)<=2000),
 add column experience jsonb not null default '[]'::jsonb check(jsonb_typeof(experience)='array' and jsonb_array_length(experience)<=20),
 add column education jsonb not null default '[]'::jsonb check(jsonb_typeof(education)='array' and jsonb_array_length(education)<=10),
 add column licences jsonb not null default '[]'::jsonb check(jsonb_typeof(licences)='array' and jsonb_array_length(licences)<=20),
 add column languages text[] not null default '{}' check(cardinality(languages)<=10),
 add column desired_titles text[] not null default '{}' check(cardinality(desired_titles)<=5),
 add column desired_pay numeric(12,2) check(desired_pay is null or desired_pay between 0 and 10000000),
 add column desired_period text check(desired_period is null or desired_period in ('hour','day','month','year')),
 add column desired_types text[] not null default '{}' check(cardinality(desired_types)<=6),
 add column ready_to_work boolean not null default false,add column availability text not null default '' check(length(availability)<=240);

create function private.clean_text(v jsonb,max_len integer) returns text language sql immutable as $$ select nullif(left(trim(coalesce(v#>>'{}','')),max_len),'') $$;
create function private.month_ok(v jsonb) returns boolean language sql immutable as $$ select v is null or jsonb_typeof(v)='null' or (v#>>'{}') ~ '^(19|20)\d{2}-(0[1-9]|1[0-2])$' $$;
create function public.jp_save_career_profile(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); exp jsonb; edu jsonb; lic jsonb; item jsonb;
begin
 if actor is null then raise exception 'Authentication required' using errcode='42501';end if;
 if not exists(select 1 from public.seeker_profiles where user_id=actor) then raise exception 'Save your name in your profile first' using errcode='22023';end if;
 if jsonb_array_length(coalesce(payload->'experience','[]'))>20 or jsonb_array_length(coalesce(payload->'education','[]'))>10 or jsonb_array_length(coalesce(payload->'licences','[]'))>20 then raise exception 'Too many entries' using errcode='22023';end if;
 for item in select * from jsonb_array_elements(coalesce(payload->'experience','[]')) loop
  if private.clean_text(item->'title',120) is null or private.clean_text(item->'company',160) is null or not private.month_ok(item->'start') or not private.month_ok(item->'end') or item->'start' is null then
   raise exception 'Each job needs a title, an employer and a start month' using errcode='22023';end if;
 end loop;
 for item in select * from jsonb_array_elements(coalesce(payload->'education','[]')) loop
  if private.clean_text(item->'qualification',160) is null or private.clean_text(item->'institution',160) is null then raise exception 'Each qualification needs a name and an institution' using errcode='22023';end if;
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('title',private.clean_text(e->'title',120),'company',private.clean_text(e->'company',160),'location',private.clean_text(e->'location',120),
  'start',e->>'start','end',nullif(e->>'end',''),'description',private.clean_text(e->'description',2000))),'[]') into exp from jsonb_array_elements(coalesce(payload->'experience','[]')) e;
 select coalesce(jsonb_agg(jsonb_build_object('qualification',private.clean_text(e->'qualification',160),'institution',private.clean_text(e->'institution',160),'year',case when (e->>'year') ~ '^(19|20)\d{2}$' then (e->>'year')::int end)),'[]')
  into edu from jsonb_array_elements(coalesce(payload->'education','[]')) e;
 select coalesce(jsonb_agg(x),'[]') into lic from (select private.clean_text(e,160) x from jsonb_array_elements(coalesce(payload->'licences','[]')) e) s where x is not null;
 update public.seeker_profiles set summary=left(trim(coalesce(payload->>'summary','')),2000),experience=exp,education=edu,licences=lic,
  languages=array(select left(trim(x),60) from jsonb_array_elements_text(coalesce(payload->'languages','[]')) x where trim(x)<>'' limit 10),
  desired_titles=array(select left(trim(x),120) from jsonb_array_elements_text(coalesce(payload->'desiredTitles','[]')) x where trim(x)<>'' limit 5),
  desired_pay=nullif(payload->>'desiredPay','')::numeric,desired_period=case when payload->>'desiredPeriod' in ('hour','day','month','year') then payload->>'desiredPeriod' end,
  desired_types=array(select x from jsonb_array_elements_text(coalesce(payload->'desiredTypes','[]')) x where x in ('Full-time','Part-time','Casual','Contract','Temporary','Internship')),
  ready_to_work=coalesce((payload->>'readyToWork')::boolean,false),availability=left(trim(coalesce(payload->>'availability','')),240),updated_at=now()
 where user_id=actor;
 return jsonb_build_object('saved',true);
end $$;

-- Skills assessments -------------------------------------------------------------------------------------------
create table public.assessments(code text primary key,title text not null,description text not null,minutes integer not null,sort integer not null);
create table private.assessment_questions(code text not null references public.assessments(code),position integer not null,prompt text not null,options text[] not null,answer integer not null,primary key(code,position));
create table public.assessment_attempts(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,code text not null references public.assessments(code),
 started_at timestamptz not null default now(),completed_at timestamptz,score integer check(score between 0 and 100),shared boolean not null default true
);
create index assessment_attempts_user on public.assessment_attempts(user_id,code,started_at desc);
alter table public.assessments enable row level security;alter table public.assessment_attempts enable row level security;
revoke all on public.assessments,public.assessment_attempts from anon,authenticated;
grant select on public.assessments to anon,authenticated;create policy assessments_public on public.assessments for select to anon,authenticated using(true);
grant select(id,code,started_at,completed_at,score,shared) on public.assessment_attempts to authenticated;
create policy attempts_own on public.assessment_attempts for select to authenticated using(user_id=(select auth.uid()));
alter table public.jobs add column assessment_code text references public.assessments(code);

create function private.assessment_level(score integer) returns text language sql immutable as $$
 select case when score>=90 then 'Expert' when score>=75 then 'Highly proficient' when score>=60 then 'Proficient' else 'Familiar' end
$$;
create function public.jp_start_assessment(assessment text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); a public.assessments%rowtype; attempt uuid;
begin
 if actor is null then raise exception 'Sign in to take an assessment' using errcode='42501';end if;
 select * into a from public.assessments where code=assessment;if not found then raise exception 'Assessment not found' using errcode='22023';end if;
 if exists(select 1 from public.assessment_attempts where user_id=actor and code=assessment and completed_at>now()-interval '30 days') then raise exception 'You can retake this assessment 30 days after your last result' using errcode='22023';end if;
 if (select count(*) from public.assessment_attempts where user_id=actor and code=assessment and started_at>now()-interval '30 days')>=3 then raise exception 'You have started this assessment three times this month. Try again later' using errcode='22023';end if;
 insert into public.assessment_attempts(user_id,code) values(actor,assessment) returning id into attempt;
 return jsonb_build_object('attempt',attempt,'title',a.title,'minutes',a.minutes,'endsAt',now()+make_interval(mins=>a.minutes),
  'questions',(select jsonb_agg(jsonb_build_object('position',position,'prompt',prompt,'options',options) order by position) from private.assessment_questions where code=assessment));
end $$;
create function public.jp_finish_assessment(attempt uuid,answers jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.assessment_attempts%rowtype; total integer; correct integer; pct integer; limit_min integer;
begin
 select * into t from public.assessment_attempts where id=attempt and user_id=auth.uid() for update;
 if not found then raise exception 'Assessment attempt not found' using errcode='42501';end if;
 if t.completed_at is not null then raise exception 'This assessment is already finished' using errcode='22023';end if;
 select minutes into limit_min from public.assessments where code=t.code;
 if now()>t.started_at+make_interval(mins=>limit_min)+interval '1 minute' then raise exception 'Time ran out for this attempt. Start again to try once more' using errcode='22023';end if;
 select count(*),count(*) filter(where (answers->>(q.position::text)) ~ '^\d+$' and (answers->>(q.position::text))::int=q.answer) into total,correct from private.assessment_questions q where q.code=t.code;
 pct:=round(100.0*correct/greatest(total,1));
 update public.assessment_attempts set completed_at=now(),score=pct where id=attempt;
 return jsonb_build_object('score',pct,'level',private.assessment_level(pct),'correct',correct,'total',total);
end $$;
create function public.jp_share_assessment(attempt uuid,share boolean) returns void language sql security definer set search_path='' as $$
 update public.assessment_attempts set shared=share where id=attempt and user_id=auth.uid()
$$;
create function public.jp_set_job_assessment(target uuid,assessment text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.job_permission(target,'edit') then raise exception 'Employer access required' using errcode='42501';end if;
 if assessment is not null and not exists(select 1 from public.assessments where code=assessment) then raise exception 'Assessment not found' using errcode='22023';end if;
 update public.jobs set assessment_code=assessment where id=target;
 return jsonb_build_object('ok',true);
end $$;
-- What a hiring team sees about an applicant beyond the application snapshot: the career profile and shared results.
create function public.jp_candidate_extras(target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare seeker uuid;
begin
 if not private.can_read_application(target) then raise exception 'Application unavailable' using errcode='42501';end if;
 select seeker_id into seeker from public.applications where id=target;
 return (select jsonb_build_object('summary',p.summary,'experience',p.experience,'education',p.education,'licences',p.licences,'languages',p.languages,'readyToWork',p.ready_to_work,'availability',p.availability,
  'assessments',coalesce((select jsonb_agg(jsonb_build_object('title',a.title,'score',x.score,'level',private.assessment_level(x.score),'completedAt',x.completed_at) order by a.sort)
   from (select distinct on (code) code,score,completed_at,shared from public.assessment_attempts where user_id=seeker and completed_at is not null order by code,completed_at desc) x join public.assessments a on a.code=x.code where x.shared),'[]'::jsonb))
  from public.seeker_profiles p where p.user_id=seeker);
end $$;

insert into public.assessments(code,title,description,minutes,sort) values
 ('customer-service','Customer service','Handling enquiries, complaints and difficult conversations with customers.',12,1),
 ('workplace-numeracy','Workplace numeracy','Everyday maths at work: percentages, rosters, pay, measurements and GST.',15,2),
 ('written-english','Written English','Grammar, clear writing and professional emails.',12,3),
 ('attention-to-detail','Attention to detail','Spotting errors and mismatches in records, orders and data.',10,4),
 ('workplace-safety','Workplace health and safety','Australian WHS duties, hazards, incidents and safe work practices.',12,5),
 ('spreadsheets','Spreadsheet basics','Formulas, sorting, filtering and reading data in Excel or Google Sheets.',12,6);
insert into private.assessment_questions(code,position,prompt,options,answer) values
 ('customer-service',1,'A customer is angry because their order arrived damaged. What should you do first?',array['Explain that the courier caused it','Listen, acknowledge the problem and apologise for the experience','Ask them to email head office','Offer a discount straight away'],1),
 ('customer-service',2,'You do not know the answer to a customer''s question. What is the best response?',array['Guess so they are not kept waiting','Tell them it is not your job','Say you will find out, and tell them when you will get back to them','Transfer them without explanation'],2),
 ('customer-service',3,'Which phrase best shows empathy?',array['Calm down, please','That is our policy','I can see why that is frustrating, let''s sort it out','You should have read the terms'],2),
 ('customer-service',4,'A customer asks for a refund that the policy does not allow. What should you do?',array['Refuse and end the conversation','Explain the policy politely and offer any options that are available','Give the refund anyway to avoid conflict','Tell them to complain online'],1),
 ('customer-service',5,'You promised to call a customer back today but cannot get the answer in time. What should you do?',array['Wait until you have the answer','Call as promised, give an update and a new time','Ask a colleague to call instead without telling them why','Send nothing; they will call again'],1),
 ('customer-service',6,'What does "first contact resolution" mean?',array['Answering the phone within one ring','Solving the customer''s issue in their first interaction','The first complaint of the day','Escalating every issue to a manager'],1),
 ('customer-service',7,'A customer becomes abusive and threatening. What is the right approach?',array['Match their tone so they take you seriously','Stay calm, set a clear boundary, and follow your workplace''s escalation procedure','Hang up without saying anything','Agree to everything they ask'],1),
 ('customer-service',8,'Two customers need help at the same time and one has been waiting longer. What do you do?',array['Serve whoever is louder','Acknowledge both, and serve the person who was waiting first','Serve the one buying more','Ignore both until a colleague arrives'],1),
 ('workplace-numeracy',1,'A shirt costs $40 and is reduced by 25%. What is the sale price?',array['$10','$25','$30','$35'],2),
 ('workplace-numeracy',2,'A price of $110 includes 10% GST. How much of it is GST?',array['$10','$11','$9.09','$1.10'],0),
 ('workplace-numeracy',3,'You work 7.6 hours a day for 5 days at $32.50 an hour. What are your gross weekly earnings?',array['$1,235.00','$1,140.00','$1,247.50','$1,300.00'],0),
 ('workplace-numeracy',4,'A shift starts at 9:45 am and finishes at 6:15 pm with a 30-minute unpaid break. How many paid hours is that?',array['8 hours','8.5 hours','7.5 hours','9 hours'],0),
 ('workplace-numeracy',5,'A pallet holds 48 boxes. How many pallets do you need for 1,000 boxes?',array['20','21','22','25'],1),
 ('workplace-numeracy',6,'A recipe for 4 people uses 300 g of rice. How much rice is needed for 10 people?',array['600 g','700 g','750 g','1,000 g'],2),
 ('workplace-numeracy',7,'Sales rose from $8,000 to $10,000. What is the percentage increase?',array['20%','25%','80%','2%'],1),
 ('workplace-numeracy',8,'A room is 4.5 m long and 3.2 m wide. What is its floor area?',array['7.7 m²','14.4 m²','15.4 m²','12.8 m²'],1),
 ('written-english',1,'Choose the correct sentence.',array['Their going to the meeting at 3 pm.','They''re going to the meeting at 3 pm.','There going to the meeting at 3 pm.','Theyre going to the meeting at 3 pm.'],1),
 ('written-english',2,'Choose the correct word: "The new policy will ___ every team."',array['affect','effect','afect','effects'],0),
 ('written-english',3,'Which is the most professional email opening to a manager you have not met?',array['Hey!!','Yo, quick one','Hi Ms Chen,','To whom it may concern, hey'],2),
 ('written-english',4,'Choose the sentence with correct punctuation.',array['Please bring: your ID, payslip and bank details.','Please bring your ID, payslip, and, bank details.','Please bring your ID, payslip and bank details.','Please bring your ID payslip and bank details'],2),
 ('written-english',5,'Which sentence is clearest?',array['The report, which was written by the team that was formed last year, which was late, was reviewed.','The team formed last year wrote the report. It was late, and the manager has now reviewed it.','Reviewed was the late report by the team of last year.','The report was late, it was reviewed, the team wrote it last year.'],1),
 ('written-english',6,'Choose the correct form: "Each of the applicants ___ been contacted."',array['have','has','are','were'],1),
 ('written-english',7,'What is the best subject line for an email asking to move an interview?',array['Hi','Request to reschedule interview on 12 March','URGENT!!!','Interview'],1),
 ('written-english',8,'Choose the correctly spelled word.',array['accomodation','acommodation','accommodation','accommadation'],2),
 ('attention-to-detail',1,'Which invoice number is different? INV-40871, INV-40871, INV-40817, INV-40871',array['The first','The second','The third','The fourth'],2),
 ('attention-to-detail',2,'An order says 12 boxes of size M. The delivery note says 12 boxes of size N. What is the mismatch?',array['Quantity','Size','Nothing','Both'],1),
 ('attention-to-detail',3,'Which address matches "14 Bay Rd, Frankston VIC 3199" exactly?',array['14 Bay Rd, Frankston VIC 3199','14 Bay St, Frankston VIC 3199','41 Bay Rd, Frankston VIC 3199','14 Bay Rd, Frankston VIC 3919'],0),
 ('attention-to-detail',4,'How many times does the letter "e" appear in "reference"?',array['2','3','4','5'],2),
 ('attention-to-detail',5,'A roster lists Sam on Monday 9–5 and Monday 1–9. What is the problem?',array['Sam works too few hours','Sam is double-booked on Monday afternoon','Nothing','Sam has no break listed'],1),
 ('attention-to-detail',6,'Which phone number matches 0412 345 678?',array['0412 354 678','0412 345 678','0421 345 678','0412 345 687'],1),
 ('attention-to-detail',7,'A form needs a date in DD/MM/YYYY format. Which entry is correct for 5 March 2026?',array['03/05/2026','5/3/26','05/03/2026','2026-03-05'],2),
 ('attention-to-detail',8,'Which total is wrong? 12 + 8 = 20; 15 + 7 = 22; 9 + 14 = 24; 30 + 11 = 41',array['12 + 8','15 + 7','9 + 14','30 + 11'],2),
 ('workplace-safety',1,'Under Australian WHS law, who has the primary duty of care to ensure workers'' health and safety?',array['The worker only','The person conducting a business or undertaking (PCBU)','SafeWork inspectors','The union'],1),
 ('workplace-safety',2,'What is the most effective control in the hierarchy of controls?',array['Personal protective equipment','Administrative controls','Eliminating the hazard','Warning signs'],2),
 ('workplace-safety',3,'You notice a spill on the warehouse floor. What should you do first?',array['Walk around it','Make the area safe or warn others, then report or clean it up','Wait for the cleaner','Take a photo for social media'],1),
 ('workplace-safety',4,'Which of these is a notifiable incident that must be reported to the regulator?',array['A paper cut','A worker needing immediate treatment as an in-patient in hospital','A broken printer','A minor bruise'],1),
 ('workplace-safety',5,'What does a Safety Data Sheet (SDS) tell you?',array['Your pay rate','How to handle, store and respond to a hazardous chemical','The fire exit locations only','Your roster'],1),
 ('workplace-safety',6,'What is the safest way to lift a heavy box from the floor?',array['Bend at the waist with straight legs','Keep the load close, bend your knees and keep your back straight, or use a lifting aid','Twist while lifting','Lift quickly in one jerk'],1),
 ('workplace-safety',7,'Workers have a duty to:',array['Take reasonable care of their own and others'' health and safety','Fix all hazards themselves','Never report incidents','Buy their own PPE'],0),
 ('workplace-safety',8,'Psychosocial hazards at work include:',array['Bullying, harassment and excessive workloads','Only noise','Only chemicals','Only falls from height'],0),
 ('spreadsheets',1,'Which formula adds the values in cells A1 to A10?',array['=ADD(A1:A10)','=SUM(A1:A10)','=TOTAL(A1-A10)','=A1+A10'],1),
 ('spreadsheets',2,'What does $A$1 mean in a formula?',array['A currency value','An absolute reference that does not change when copied','A hidden cell','A text value'],1),
 ('spreadsheets',3,'Which function finds the average of B2 to B20?',array['=MEAN(B2:B20)','=AVG(B2:B20)','=AVERAGE(B2:B20)','=MEDIAN(B2:B20)'],2),
 ('spreadsheets',4,'You want to see only rows where the State column is "VIC". What should you use?',array['Sort','Filter','Merge cells','Freeze panes'],1),
 ('spreadsheets',5,'What does =IF(C2>=50,"Pass","Fail") return when C2 is 50?',array['Pass','Fail','50','An error'],0),
 ('spreadsheets',6,'Which function counts cells in D2:D100 that are not empty?',array['=COUNT(D2:D100)','=COUNTA(D2:D100)','=SUM(D2:D100)','=LEN(D2:D100)'],1),
 ('spreadsheets',7,'What is the result of =ROUND(3.456,1)?',array['3.4','3.5','3.46','3'],1),
 ('spreadsheets',8,'Which function looks up a value in the first column of a table and returns a value from another column?',array['VLOOKUP','CONCAT','TRIM','NOW'],0);

-- Hiring events ------------------------------------------------------------------------------------------------
create table public.hiring_events(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id) on delete cascade,
 title text not null check(length(title) between 5 and 140),description text not null check(length(description) between 20 and 5000),
 starts_at timestamptz not null,ends_at timestamptz not null,time_zone text not null,mode text not null check(mode in ('online','in_person')),
 location text check(location is null or length(location)<=200),join_url text check(join_url is null or (join_url ~ '^https://' and length(join_url)<=500)),
 capacity integer check(capacity is null or capacity between 1 and 10000),registered integer not null default 0,
 cancelled_at timestamptz,created_by uuid references auth.users(id) on delete set null,created_at timestamptz not null default now(),
 check(ends_at>starts_at and ends_at<=starts_at+interval '3 days'),check(mode='online' or location is not null)
);
create index hiring_events_upcoming on public.hiring_events(starts_at) where cancelled_at is null;
create table public.event_registrations(event_id uuid not null references public.hiring_events(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,created_at timestamptz not null default now(),primary key(event_id,user_id));
alter table public.hiring_events enable row level security;alter table public.event_registrations enable row level security;
revoke all on public.hiring_events,public.event_registrations from anon,authenticated;
-- The online joining link stays private to registrants and the employer.
grant select(id,company_id,title,description,starts_at,ends_at,time_zone,mode,location,capacity,registered,cancelled_at,created_at) on public.hiring_events to anon,authenticated;
create policy events_public on public.hiring_events for select to anon,authenticated using(exists(select 1 from public.companies c where c.id=company_id and c.verified_at is not null and c.suspended_at is null));
grant select on public.event_registrations to authenticated;
create policy registrations_own on public.event_registrations for select to authenticated using(user_id=(select auth.uid()));
create function public.jp_save_event(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare company uuid:=(payload->>'companyId')::uuid; target uuid:=nullif(payload->>'id','')::uuid; s timestamptz; e timestamptz;
begin
 if target is not null then select company_id into company from public.hiring_events where id=target;end if;
 if company is null or not exists(select 1 from public.company_memberships m join public.companies c on c.id=m.company_id where m.company_id=company and m.user_id=auth.uid() and m.revoked_at is null and m.role in ('owner','recruiter') and c.verified_at is not null) then
  raise exception 'Owners and recruiters of verified employers can run hiring events' using errcode='42501';end if;
 begin s:=(payload->>'startsAt')::timestamptz;e:=(payload->>'endsAt')::timestamptz;exception when others then raise exception 'Choose a start and end time' using errcode='22023';end;
 if s is null or e is null or s<now() then raise exception 'Choose a start time in the future' using errcode='22023';end if;
 begin
  if target is null then
   insert into public.hiring_events(company_id,title,description,starts_at,ends_at,time_zone,mode,location,join_url,capacity,created_by)
   values(company,trim(payload->>'title'),trim(payload->>'description'),s,e,coalesce(payload->>'timeZone','Australia/Melbourne'),payload->>'mode',nullif(trim(coalesce(payload->>'location','')),''),nullif(trim(coalesce(payload->>'joinUrl','')),''),nullif(payload->>'capacity','')::int,auth.uid()) returning id into target;
  else
   update public.hiring_events set title=trim(payload->>'title'),description=trim(payload->>'description'),starts_at=s,ends_at=e,time_zone=coalesce(payload->>'timeZone',time_zone),mode=payload->>'mode',
    location=nullif(trim(coalesce(payload->>'location','')),''),join_url=nullif(trim(coalesce(payload->>'joinUrl','')),''),capacity=nullif(payload->>'capacity','')::int where id=target and cancelled_at is null;
  end if;
 exception when check_violation or not_null_violation or invalid_text_representation then
  raise exception 'Give a title, a description of at least 20 characters, an end after the start (within 3 days), and a location for in-person events' using errcode='22023';
 end;
 return jsonb_build_object('id',target);
end $$;
create function public.jp_cancel_event(target uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.hiring_events ev join public.company_memberships m on m.company_id=ev.company_id where ev.id=target and m.user_id=auth.uid() and m.revoked_at is null and m.role in ('owner','recruiter')) then raise exception 'Employer access required' using errcode='42501';end if;
 update public.hiring_events set cancelled_at=now() where id=target and cancelled_at is null;
end $$;
create function public.jp_register_event(target uuid,attend boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare ev public.hiring_events%rowtype;
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Sign in with a confirmed account to register' using errcode='42501';end if;
 select * into ev from public.hiring_events where id=target for update;
 if not found or ev.cancelled_at is not null or ev.ends_at<now() then raise exception 'This event is not taking registrations' using errcode='22023';end if;
 if attend then
  if ev.capacity is not null and ev.registered>=ev.capacity and not exists(select 1 from public.event_registrations where event_id=target and user_id=auth.uid()) then raise exception 'This event is full' using errcode='22023';end if;
  insert into public.event_registrations(event_id,user_id) values(target,auth.uid()) on conflict do nothing;
  if found then update public.hiring_events set registered=registered+1 where id=target;end if;
 else
  delete from public.event_registrations where event_id=target and user_id=auth.uid();
  if found then update public.hiring_events set registered=registered-1 where id=target;end if;
 end if;
 return jsonb_build_object('registered',attend,'joinUrl',case when attend then ev.join_url end);
end $$;
create function public.jp_my_event(target uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('registered',exists(select 1 from public.event_registrations r where r.event_id=target and r.user_id=auth.uid()),
  'joinUrl',(select ev.join_url from public.hiring_events ev where ev.id=target and exists(select 1 from public.event_registrations r where r.event_id=target and r.user_id=auth.uid())))
$$;
create function public.jp_company_events(company uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.company_memberships m where m.company_id=company and m.user_id=auth.uid() and m.revoked_at is null) then raise exception 'Employer access required' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',ev.id,'title',ev.title,'description',ev.description,'startsAt',ev.starts_at,'endsAt',ev.ends_at,'timeZone',ev.time_zone,'mode',ev.mode,'location',ev.location,'joinUrl',ev.join_url,'capacity',ev.capacity,'registered',ev.registered,'cancelled',ev.cancelled_at is not null,
  'attendees',coalesce((select jsonb_agg(jsonb_build_object('name',p.full_name,'email',coalesce(nullif(p.email,''),u.email),'headline',p.headline,'location',p.location) order by r.created_at) from public.event_registrations r join auth.users u on u.id=r.user_id left join public.seeker_profiles p on p.user_id=r.user_id where r.event_id=ev.id),'[]'::jsonb)) order by ev.starts_at desc)
  from public.hiring_events ev where ev.company_id=company),'[]'::jsonb);
end $$;

-- "Not interested" ---------------------------------------------------------------------------------------------
create table public.hidden_jobs(user_id uuid not null references auth.users(id) on delete cascade,job_id uuid not null references public.jobs(id) on delete cascade,created_at timestamptz not null default now(),primary key(user_id,job_id));
alter table public.hidden_jobs enable row level security;revoke all on public.hidden_jobs from anon,authenticated;
grant select on public.hidden_jobs to authenticated;create policy hidden_own on public.hidden_jobs for select to authenticated using(user_id=(select auth.uid()));
create function public.jp_hide_job(target uuid,hide boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to hide jobs' using errcode='42501';end if;
 if hide then insert into public.hidden_jobs(user_id,job_id) select auth.uid(),target where exists(select 1 from public.jobs where id=target) on conflict do nothing;
 else delete from public.hidden_jobs where user_id=auth.uid() and job_id=target;end if;
end $$;

revoke all on function public.jp_save_career_profile(jsonb),public.jp_start_assessment(text),public.jp_finish_assessment(uuid,jsonb),public.jp_share_assessment(uuid,boolean),public.jp_set_job_assessment(uuid,text),public.jp_candidate_extras(uuid),
 public.jp_save_event(jsonb),public.jp_cancel_event(uuid),public.jp_register_event(uuid,boolean),public.jp_my_event(uuid),public.jp_company_events(uuid),public.jp_hide_job(uuid,boolean) from public,anon;
grant execute on function public.jp_save_career_profile(jsonb),public.jp_start_assessment(text),public.jp_finish_assessment(uuid,jsonb),public.jp_share_assessment(uuid,boolean),public.jp_set_job_assessment(uuid,text),public.jp_candidate_extras(uuid),
 public.jp_save_event(jsonb),public.jp_cancel_event(uuid),public.jp_register_event(uuid,boolean),public.jp_my_event(uuid),public.jp_company_events(uuid),public.jp_hide_job(uuid,boolean) to authenticated;
revoke all on function private.clean_text(jsonb,integer),private.month_ok(jsonb),private.assessment_level(integer) from public;
commit;
