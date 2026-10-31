create type app_role as enum ('aicte_admin','aicte_officer','institution_admin','institution_staff','university_admin','verifier','scholarship_portal','student');
create type institution_status as enum ('Active','Suspended');
create type program_level as enum ('UG','PG','Diploma','PGDM');
create type quota_type as enum ('CONVENOR','NON_CONVENOR','NRI','SUPERNUMERARY','LATERAL');
create type admission_category as enum ('Regular','Supernumerary','Lateral');
create type fee_status as enum ('Paid','Partial','Pending','Waived');
create type enrolment_status as enum ('Active','Withdrawn','PassedOut');
create type validation_status as enum ('Pending','Clean','Flagged','Verified','Revoked');
create type oci_status as enum ('none','holder','applied');
create type batch_status as enum ('Preview','Submitted','Rejected');
create type issue_severity as enum ('Error','Warning','Info');
create type match_status as enum ('Open','Resolved');
create type cluster_type as enum ('SHARED_MOBILE','SHARED_EMAIL','SHARED_ADDRESS','MULTI_FULLTIME','CATEGORY_SPIKE','ADMISSION_SURGE');
create type cluster_status as enum ('Open','Under review','Cleared','Escalated');
create type credential_status as enum ('Valid','Revoked');
create type verifier_type as enum ('Employer','Regulator');
create type verifier_status as enum ('Pending','Approved','Rejected');
create type grantee_type as enum ('verifier_org','scholarship_portal');
create type approval_action as enum ('CHANGE_INTAKE','REVOKE_RECORD','APPROVE_VERIFIER');
create type approval_status as enum ('Pending','Approved','Rejected');
create type result_status as enum ('Pass','Fail','Detained');
create type scholarship_status as enum ('Pending','ConsentGranted','Fulfilled','Denied');
create type marksheet_outcome as enum ('Match','Mismatch','NotFound');
create type alert_status as enum ('Open','Acknowledged','Resolved');

-- Must stay byte-identical to canonicalJSON() in lib/crypto: sorted keys, no whitespace.
create function public.canonical_json(j jsonb) returns text
language plpgsql immutable set search_path = public as $$
declare
  t text := jsonb_typeof(j);
  r text;
begin
  if t = 'object' then
    select '{' || string_agg(to_jsonb(k)::text || ':' || public.canonical_json(v), ',' order by k collate "C") || '}'
      into r from jsonb_each(j) as e(k, v);
    return coalesce(r, '{}');
  elsif t = 'array' then
    select '[' || string_agg(public.canonical_json(v), ',' order by ord) || ']'
      into r from jsonb_array_elements(j) with ordinality as a(v, ord);
    return coalesce(r, '[]');
  end if;
  return j::text;
end $$;

create function public.audit_at_text(ts timestamptz) returns text
language sql immutable set search_path = public as $$
  select to_char(ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
$$;

create function public.set_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;
