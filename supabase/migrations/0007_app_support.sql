-- Seeded rows are kept by `npm run demo:reset`; anything created during a demo is removed.
alter table upload_batches add column seeded boolean not null default false;
alter table alerts add column seeded boolean not null default false;
alter table consents add column seeded boolean not null default false;
alter table access_log add column seeded boolean not null default false;
alter table scholarship_requests add column seeded boolean not null default false;
alter table approvals add column seeded boolean not null default false;
alter table fraud_clusters add column seeded boolean not null default false;
alter table credentials add column seeded boolean not null default false;
alter table cross_matches add column seeded boolean not null default false;
alter table validation_issues add column seeded boolean not null default false;
alter table webhooks add column seeded boolean not null default false;
alter table verifier_orgs add column seeded boolean not null default false;
alter table university_result_batches add column seeded boolean not null default false;

alter table enrolments add column updated_by uuid;

create or replace function public.snapshot_enrolment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (to_jsonb(old) - array['created_at','updated_at','version','updated_by']) is distinct from
     (to_jsonb(new) - array['created_at','updated_at','version','updated_by']) then
    insert into enrolment_history (enrolment_id, institution_id, changed_by, before, after)
    values (new.id, new.institution_id, coalesce(auth.uid(), new.updated_by), to_jsonb(old), to_jsonb(new));
  end if;
  return new;
end $$;

alter table consents add column receipt jsonb;
alter table consents add column otp_attempts int not null default 0;
alter table scholarship_requests add column consent_id uuid references consents(id);

alter table fraud_clusters add column member_ids uuid[] not null default '{}';

create table app_cache (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table app_cache enable row level security;
revoke all on app_cache from anon;
grant select on app_cache to authenticated;
grant all on app_cache to service_role;
create policy app_cache_read on app_cache for select to authenticated using (public.is_aicte());

-- Atomic token bucket. Returns true when a token was available.
create function public.take_token(p_key text, p_capacity numeric, p_refill_per_sec numeric) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_tokens numeric;
begin
  insert into rate_limits (bucket_key, tokens, refilled_at) values (p_key, p_capacity, now())
    on conflict (bucket_key) do nothing;
  select least(p_capacity, tokens + extract(epoch from now() - refilled_at) * p_refill_per_sec)
    into v_tokens from rate_limits where bucket_key = p_key for update;
  if v_tokens < 1 then
    update rate_limits set tokens = v_tokens, refilled_at = now() where bucket_key = p_key;
    return false;
  end if;
  update rate_limits set tokens = v_tokens - 1, refilled_at = now() where bucket_key = p_key;
  return true;
end $$;
revoke all on function public.take_token(text, numeric, numeric) from public, anon, authenticated;
grant execute on function public.take_token(text, numeric, numeric) to service_role;

create view v_enrolment_trend with (security_invoker = true) as
  select date_trunc('day', created_at)::date as day, count(*)::int as enrolments
  from enrolments where enrolment_status <> 'PassedOut'
  group by 1;

create view v_alert_trend with (security_invoker = true) as
  select date_trunc('day', created_at)::date as day, count(*)::int as alerts
  from alerts group by 1;

-- Aggregates only, so universities can see their affiliated numbers without student-level access.
create view v_university_summary with (security_invoker = false) as
  select i.university_id, count(distinct i.id)::int as institutions, count(e.id)::int as active_enrolments
  from institutions i
  left join enrolments e on e.institution_id = i.id and e.enrolment_status = 'Active'
  where i.university_id = public.app_university_id() or public.is_aicte()
  group by i.university_id;

revoke all on v_enrolment_trend, v_alert_trend, v_university_summary from public, anon;
grant select on v_enrolment_trend, v_alert_trend, v_university_summary to authenticated, service_role;

alter publication supabase_realtime add table upload_batches;
