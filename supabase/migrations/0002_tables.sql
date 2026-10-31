create table universities (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  state text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table institutions (
  id uuid primary key default gen_random_uuid(),
  aicte_id text not null unique,
  name text not null,
  state text not null,
  district text not null,
  type text not null,
  status institution_status not null default 'Active',
  contact_email text,
  university_id uuid references universities(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table verifier_orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type verifier_type not null,
  status verifier_status not null default 'Pending',
  approved_by uuid references auth.users(id),
  scope text[] not null default array['institution','program','years','status'],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table scholarship_portals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  state text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role app_role not null,
  full_name text not null,
  institution_id uuid references institutions(id),
  university_id uuid references universities(id),
  verifier_org_id uuid references verifier_orgs(id),
  portal_id uuid references scholarship_portals(id),
  apaar_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table programs (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id),
  name text not null,
  level program_level not null,
  academic_year text not null,
  approved_intake int not null check (approved_intake > 0),
  supernumerary_cap int not null default 0 check (supernumerary_cap >= 0),
  duration_years int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institution_id, name, academic_year)
);

create table seat_matrix (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  quota_type quota_type not null,
  seats_allowed int not null check (seats_allowed >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, quota_type)
);

create table quota_labels (
  id uuid primary key default gen_random_uuid(),
  state text not null,
  quota_type quota_type not null,
  label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (state, quota_type)
);

create table mock_apaar_registry (
  id uuid primary key default gen_random_uuid(),
  apaar_id text not null unique check (apaar_id ~ '^[0-9]{12}$'),
  name text not null,
  dob date not null,
  gender text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table students (
  id uuid primary key default gen_random_uuid(),
  apaar_hash text not null unique,
  apaar_id_enc text not null,
  name text not null,
  dob date not null,
  gender text not null,
  nationality text not null default 'Indian',
  is_nri boolean not null default false,
  oci_status oci_status not null default 'none',
  is_foreign_national boolean not null default false,
  passport_no_enc text,
  mobile_enc text,
  mobile_hash text,
  email_enc text,
  email_hash text,
  address_hash text,
  prev_qualification text,
  prev_marks_pct numeric(5,2),
  prev_pass_year int,
  created_by_institution_id uuid references institutions(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index students_mobile_hash_idx on students(mobile_hash);
create index students_email_hash_idx on students(email_hash);
create index students_address_hash_idx on students(address_hash);

create table upload_batches (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id),
  program_id uuid references programs(id),
  file_name text not null,
  row_count int not null default 0,
  error_count int not null default 0,
  warning_count int not null default 0,
  status batch_status not null default 'Preview',
  submitted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index upload_batches_institution_idx on upload_batches(institution_id);

create table enrolments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id),
  institution_id uuid not null references institutions(id),
  program_id uuid not null references programs(id),
  admission_date date not null,
  quota_type quota_type not null,
  admission_category admission_category not null default 'Regular',
  counselling_allotment_no text,
  fee_status fee_status not null default 'Pending',
  enrolment_status enrolment_status not null default 'Active',
  validation_status validation_status not null default 'Pending',
  upload_batch_id uuid references upload_batches(id),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, program_id)
);
create index enrolments_institution_idx on enrolments(institution_id);
create index enrolments_program_idx on enrolments(program_id);
create index enrolments_status_idx on enrolments(enrolment_status, validation_status);

create table enrolment_history (
  id uuid primary key default gen_random_uuid(),
  enrolment_id uuid not null references enrolments(id) on delete cascade,
  institution_id uuid not null references institutions(id),
  changed_by uuid,
  before jsonb not null,
  after jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index enrolment_history_enrolment_idx on enrolment_history(enrolment_id);

-- Enrolments hold no direct PII, so the snapshot is complete; ids stand in for identity.
create function public.snapshot_enrolment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (to_jsonb(old) - array['created_at','updated_at','version']) is distinct from
     (to_jsonb(new) - array['created_at','updated_at','version']) then
    insert into enrolment_history (enrolment_id, institution_id, changed_by, before, after)
    values (new.id, new.institution_id, auth.uid(), to_jsonb(old), to_jsonb(new));
  end if;
  return new;
end $$;
create trigger enrolments_snapshot after update on enrolments
  for each row execute function public.snapshot_enrolment();

create table validation_issues (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id),
  batch_id uuid not null references upload_batches(id) on delete cascade,
  enrolment_id uuid references enrolments(id) on delete set null,
  row_number int,
  rule_code text not null,
  severity issue_severity not null,
  message text not null,
  suggestion jsonb,
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index validation_issues_batch_idx on validation_issues(batch_id);
create index validation_issues_institution_idx on validation_issues(institution_id, resolved);

create table cross_matches (
  id uuid primary key default gen_random_uuid(),
  apaar_hash text not null,
  enrolment_a uuid not null references enrolments(id),
  enrolment_b uuid not null references enrolments(id),
  status match_status not null default 'Open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (enrolment_a, enrolment_b)
);

create table fraud_clusters (
  id uuid primary key default gen_random_uuid(),
  cluster_type cluster_type not null,
  key_hash text not null,
  member_count int not null,
  institution_id uuid references institutions(id),
  explanation text,
  status cluster_status not null default 'Open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cluster_type, key_hash)
);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  severity issue_severity not null default 'Error',
  institution_id uuid references institutions(id),
  program_id uuid references programs(id),
  title text not null,
  message text not null,
  meta jsonb not null default '{}',
  status alert_status not null default 'Open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index alerts_status_idx on alerts(status, created_at desc);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notifications_user_idx on notifications(user_id, read_at);

create table credentials (
  id uuid primary key default gen_random_uuid(),
  record_id text not null unique,
  enrolment_id uuid not null references enrolments(id),
  payload jsonb not null,
  signature text not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  status credential_status not null default 'Valid',
  revoked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index credentials_enrolment_idx on credentials(enrolment_id);

create table revocations (
  id uuid primary key default gen_random_uuid(),
  record_id text not null references credentials(record_id),
  reason text not null,
  revoked_by uuid references auth.users(id),
  at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table consents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id),
  grantee_type grantee_type not null,
  grantee_id uuid not null,
  purpose text not null,
  scope text[] not null,
  expires_at timestamptz,
  approved_at timestamptz,
  denied_at timestamptz,
  revoked_at timestamptz,
  consumed_at timestamptz,
  otp_hash text,
  otp_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index consents_student_idx on consents(student_id);
create index consents_grantee_idx on consents(grantee_id);

create table access_log (
  id uuid primary key default gen_random_uuid(),
  who uuid,
  grantee text not null,
  student_id uuid not null references students(id),
  fields_returned text[] not null,
  purpose text not null,
  at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index access_log_student_idx on access_log(student_id);

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid references institutions(id),
  university_id uuid references universities(id),
  verifier_org_id uuid references verifier_orgs(id),
  portal_id uuid references scholarship_portals(id),
  name text,
  key_prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default '{}',
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(institution_id, university_id, verifier_org_id, portal_id) = 1)
);

create table webhooks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references institutions(id),
  url text not null,
  events text[] not null,
  secret_enc text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid not null references webhooks(id) on delete cascade,
  event text not null,
  status_code int,
  ok boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  action_type approval_action not null,
  payload jsonb not null,
  requested_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  status approval_status not null default 'Pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (approved_by is null or approved_by <> requested_by)
);

create table university_result_batches (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references universities(id),
  file_name text not null,
  semester int,
  row_count int not null default 0,
  digest text not null,
  signature text not null,
  submitted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Semester 0 holds the qualifying examination marks used for admission eligibility.
create table university_results (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references universities(id),
  apaar_hash text not null,
  semester int not null check (semester >= 0),
  course_code text,
  sgpa numeric(4,2),
  percentage numeric(5,2),
  result_status result_status not null,
  batch_id uuid references university_result_batches(id),
  batch_signature text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (university_id, apaar_hash, semester)
);
create index university_results_hash_idx on university_results(apaar_hash, semester);

create table eligibility_rules (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references programs(id) on delete cascade,
  level program_level,
  rule_type text not null,
  params jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (program_id is not null or level is not null)
);

create table scholarship_requests (
  id uuid primary key default gen_random_uuid(),
  portal_id uuid not null references scholarship_portals(id),
  apaar_hash text not null,
  scheme text not null,
  academic_year text not null default '2026-27',
  status scholarship_status not null default 'Pending',
  denial_reason text,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index scholarship_requests_hash_idx on scholarship_requests(apaar_hash, scheme, academic_year);

create table marksheet_submissions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id),
  semester int not null,
  claimed_pct numeric(5,2) not null,
  verified_pct numeric(5,2),
  outcome marksheet_outcome not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table simulated_digilocker (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id),
  record_id text not null references credentials(record_id),
  pushed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, record_id)
);

-- Simulated SMS inbox: the OTP is visible here by design, only in the student's own panel.
create table simulated_sms (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id),
  message text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table rate_limits (
  bucket_key text primary key,
  tokens numeric not null,
  refilled_at timestamptz not null default now()
);

do $$
declare t text;
begin
  for t in select table_name from information_schema.columns
           where table_schema = 'public' and column_name = 'updated_at'
             and table_name in (select tablename from pg_tables where schemaname = 'public')
  loop
    execute format('create trigger %I before update on %I for each row execute function public.set_updated_at()', t || '_updated_at', t);
  end loop;
end $$;
