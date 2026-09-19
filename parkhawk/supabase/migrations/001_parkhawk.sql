-- Apply once in a fresh Supabase project's SQL editor.
-- The app uses a server-only service key. Browser roles cannot read raw search
-- records, emails, or reliability scores, and cannot write to any table.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  role text not null default 'USER' check (role in ('USER','ADMIN')),
  reliability_score integer not null default 80 check (reliability_score between 0 and 100),
  reporting_suspended_until timestamptz,
  created_at timestamptz not null default now()
);
create table public.parking_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(name) between 2 and 60),
  description text not null default '' check (length(description)<=240),
  location_type text not null check (location_type in ('GARAGE','SURFACE_LOT','DECK')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  parking_location_id uuid not null references public.parking_locations(id),
  report_type text not null check (report_type in ('OPEN_SPOT','LEAVING_SOON','SEARCHING','TRAFFIC')),
  zone_or_floor text check (length(zone_or_floor)<=30),
  quantity integer check (quantity between 1 and 3),
  leaving_eta_minutes integer check (leaving_eta_minutes in (0,10,30)),
  traffic_level text check (traffic_level in ('LIGHT','MODERATE','HEAVY')),
  note text check (length(note)<=180),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','CLOSED','REMOVED')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null check (expires_at>created_at),
  check ((report_type='OPEN_SPOT' and quantity is not null) or (report_type='LEAVING_SOON' and leaving_eta_minutes is not null) or (report_type='TRAFFIC' and traffic_level is not null) or report_type='SEARCHING')
);
create table public.report_feedback (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id),
  user_id uuid not null references public.profiles(id),
  feedback_type text not null check (feedback_type in ('STILL_OPEN','TAKEN')),
  created_at timestamptz not null default now(),
  unique (report_id,user_id)
);
create index reports_active on public.reports(parking_location_id,status,expires_at);
create index reports_type on public.reports(user_id,report_type,created_at);
create index reports_created on public.reports(created_at desc);
create index feedback_report on public.report_feedback(report_id);
create index feedback_created on public.report_feedback(created_at);

alter table public.profiles enable row level security;
alter table public.parking_locations enable row level security;
alter table public.reports enable row level security;
alter table public.report_feedback enable row level security;
revoke all on public.profiles,public.parking_locations,public.reports,public.report_feedback from anon,authenticated;
grant all on public.profiles,public.parking_locations,public.reports,public.report_feedback to service_role;
-- No browser-role policies: default deny. All data flows through authorized
-- Next.js endpoints, which redact identities before sending parking data.

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,email,display_name) values(new.id,new.email,coalesce(nullif(left(new.raw_user_meta_data->>'display_name',60),''),'Campus user'));
  return new;
end; $$;
create trigger parkhawk_new_user after insert on auth.users for each row execute function public.handle_new_user();
revoke all on function public.handle_new_user() from public,anon,authenticated;

create function public.submit_report(actor uuid,payload jsonb) returns uuid language plpgsql set search_path=public as $$
declare u profiles; kind text:=payload->>'report_type'; eta integer; duration integer; report_id uuid;
begin
  -- Serializing on the actor prevents concurrent renewals from adding demand twice.
  select * into u from profiles where id=actor for update;
  if not found then raise exception 'User not found.'; end if;
  if u.reporting_suspended_until>now() then raise exception 'Reporting is suspended.'; end if;
  if not exists(select 1 from parking_locations where id=(payload->>'parking_location_id')::uuid and active) then raise exception 'Location unavailable.'; end if;
  if exists(select 1 from reports where user_id=actor and report_type=kind and status='ACTIVE' and expires_at>now() and created_at>now()-interval '15 seconds') then raise exception 'Wait 15 seconds before updating this report type.'; end if;
  eta:=case when kind='LEAVING_SOON' then (payload->>'leaving_eta_minutes')::integer else null end;
  duration:=case kind when 'OPEN_SPOT' then 3 when 'LEAVING_SOON' then eta+5 when 'SEARCHING' then 15 when 'TRAFFIC' then 10 else null end;
  if duration is null then raise exception 'Invalid report type or departure time.'; end if;
  update reports set status='CLOSED' where user_id=actor and report_type=kind and status='ACTIVE';
  insert into reports(user_id,parking_location_id,report_type,zone_or_floor,quantity,leaving_eta_minutes,traffic_level,note,expires_at)
    values(actor,(payload->>'parking_location_id')::uuid,kind,nullif(payload->>'zone_or_floor',''),case when kind='OPEN_SPOT' then (payload->>'quantity')::integer end,eta,case when kind='TRAFFIC' then payload->>'traffic_level' end,coalesce(payload->>'note',''),now()+make_interval(mins=>duration)) returning id into report_id;
  return report_id;
end; $$;

create function public.respond_report(actor uuid,report_id_input uuid,response text) returns void language plpgsql set search_path=public as $$
declare r reports; previous_early integer; delta integer:=0;
begin
  if not exists(select 1 from profiles where id=actor) then raise exception 'User not found.'; end if;
  if exists(select 1 from profiles where id=actor and reporting_suspended_until>now()) then raise exception 'Reporting is suspended.'; end if;
  select * into r from reports where id=report_id_input for update;
  if not found or r.status<>'ACTIVE' or r.expires_at<=now() or r.report_type<>'OPEN_SPOT' then raise exception 'This open-space report is no longer active.'; end if;
  if not exists(select 1 from parking_locations where id=r.parking_location_id and active) then raise exception 'Location unavailable.'; end if;
  if actor=r.user_id then raise exception 'You cannot confirm your own report.'; end if;
  if response not in ('STILL_OPEN','TAKEN') then raise exception 'Invalid feedback.'; end if;
  if exists(select 1 from report_feedback where report_id=r.id and user_id=actor) then raise exception 'You already responded to this report.'; end if;
  -- Lock the reporter while computing the reputation adjustment.
  perform 1 from profiles where id=r.user_id for update;
  select count(*) into previous_early from report_feedback f join reports prior on prior.id=f.report_id where prior.user_id=r.user_id and f.feedback_type='TAKEN' and f.created_at>now()-interval '24 hours' and f.created_at-prior.created_at<interval '45 seconds';
  insert into report_feedback(report_id,user_id,feedback_type) values(r.id,actor,response);
  if response='STILL_OPEN' then delta:=1;
  else
    update reports set status='CLOSED' where id=r.id;
    if now()-r.created_at<interval '45 seconds' and previous_early>=1 then delta:=-3; end if;
  end if;
  update profiles set reliability_score=greatest(0,least(100,reliability_score+delta)) where id=r.user_id;
end; $$;

create function public.admin_action(actor uuid,payload jsonb) returns void language plpgsql set search_path=public as $$
declare action text:=payload->>'action'; l jsonb:=payload->'location'; reporter uuid;
begin
  if not exists(select 1 from profiles where id=actor and role='ADMIN') then raise exception 'Administrator access required.'; end if;
  if action='location' then
    if l->>'id' is null then
      insert into parking_locations(name,description,location_type,active) values(l->>'name',l->>'description',l->>'location_type',(l->>'active')::boolean);
    else
      update parking_locations set name=l->>'name',description=l->>'description',location_type=l->>'location_type',active=(l->>'active')::boolean where id=(l->>'id')::uuid;
      if not found then raise exception 'Location not found.'; end if;
    end if;
  elsif action='suspend' then
    if (payload->>'hours')::integer not in (0,1,24,168) then raise exception 'Invalid suspension duration.'; end if;
    update profiles set reporting_suspended_until=case when (payload->>'hours')::integer=0 then null else now()+make_interval(hours=>(payload->>'hours')::integer) end where id=(payload->>'user_id')::uuid;
    if not found then raise exception 'User not found.'; end if;
  elsif action='remove' then
    update reports set status='REMOVED' where id=(payload->>'report_id')::uuid and status<>'REMOVED' returning user_id into reporter;
    if reporter is null then raise exception 'Report not found or already removed.'; end if;
    update profiles set reliability_score=greatest(0,reliability_score-5) where id=reporter;
  else raise exception 'Invalid admin action.';
  end if;
end; $$;
revoke all on function public.submit_report(uuid,jsonb),public.respond_report(uuid,uuid,text),public.admin_action(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.submit_report(uuid,jsonb),public.respond_report(uuid,uuid,text),public.admin_action(uuid,jsonb) to service_role;
