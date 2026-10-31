-- Helpers are SECURITY DEFINER so policies can read profiles without recursing through RLS.
create function public.app_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where user_id = auth.uid()
$$;
create function public.app_institution_id() returns uuid
language sql stable security definer set search_path = public as $$
  select institution_id from profiles where user_id = auth.uid()
$$;
create function public.app_university_id() returns uuid
language sql stable security definer set search_path = public as $$
  select university_id from profiles where user_id = auth.uid()
$$;
create function public.app_verifier_org_id() returns uuid
language sql stable security definer set search_path = public as $$
  select verifier_org_id from profiles where user_id = auth.uid()
$$;
create function public.app_apaar_hash() returns text
language sql stable security definer set search_path = public as $$
  select apaar_hash from profiles where user_id = auth.uid()
$$;
create function public.app_student_id() returns uuid
language sql stable security definer set search_path = public as $$
  select s.id from students s join profiles p on p.apaar_hash = s.apaar_hash where p.user_id = auth.uid()
$$;
create function public.is_aicte() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() in ('aicte_admin','aicte_officer'), false)
$$;
create function public.is_aicte_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() = 'aicte_admin', false)
$$;
create function public.is_institution_user() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() in ('institution_admin','institution_staff'), false)
$$;
create function public.institution_has_student(p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from enrolments e where e.student_id = p_student and e.institution_id = public.app_institution_id())
$$;
create function public.student_has_institution(p_institution uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from enrolments e where e.institution_id = p_institution and e.student_id = public.app_student_id())
$$;
create function public.student_has_program(p_program uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from enrolments e where e.program_id = p_program and e.student_id = public.app_student_id())
$$;
create function public.university_has_institution(p_institution uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from institutions i where i.id = p_institution and i.university_id = public.app_university_id())
$$;
create function public.student_owns_enrolment(p_enrolment uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from enrolments e where e.id = p_enrolment and e.student_id = public.app_student_id())
$$;
create function public.institution_owns_enrolment(p_enrolment uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from enrolments e where e.id = p_enrolment and e.institution_id = public.app_institution_id())
$$;
create function public.institution_owns_program(p_program uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from programs p where p.id = p_program and p.institution_id = public.app_institution_id())
$$;
create function public.university_has_program(p_program uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from programs p join institutions i on i.id = p.institution_id
                 where p.id = p_program and i.university_id = public.app_university_id())
$$;

-- Deny by default: RLS on every table, then only the explicit policies below.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
    if t not in ('audit_log', 'audit_tamper_backup') then
      execute format('grant select, insert, update, delete on %I to authenticated', t);
      execute format('grant all on %I to service_role', t);
    end if;
  end loop;
end $$;
grant usage on all sequences in schema public to authenticated, service_role;
revoke all on v_audit_chain from public, anon;
grant select on v_audit_chain to authenticated, service_role;

-- Institutions must never learn who first created a student who is enrolled elsewhere too.
revoke select on students from authenticated;
grant select (id, apaar_hash, apaar_id_enc, name, dob, gender, nationality, is_nri, oci_status, is_foreign_national,
              passport_no_enc, mobile_enc, mobile_hash, email_enc, email_hash, address_hash, prev_qualification,
              prev_marks_pct, prev_pass_year, created_at, updated_at) on students to authenticated;

create policy universities_read on universities for select to authenticated using (true);
create policy quota_labels_read on quota_labels for select to authenticated using (true);
create policy eligibility_read on eligibility_rules for select to authenticated using (true);
create policy eligibility_admin on eligibility_rules for all to authenticated
  using (public.is_aicte_admin()) with check (public.is_aicte_admin());

create policy institutions_read on institutions for select to authenticated using (
  public.is_aicte() or id = public.app_institution_id()
  or university_id = public.app_university_id() or public.student_has_institution(id));

create policy profiles_read on profiles for select to authenticated using (user_id = auth.uid() or public.is_aicte());

create policy programs_read on programs for select to authenticated using (
  public.is_aicte() or institution_id = public.app_institution_id()
  or public.university_has_institution(institution_id) or public.student_has_program(id));

create policy seat_matrix_read on seat_matrix for select to authenticated using (
  public.is_aicte() or public.institution_owns_program(program_id) or public.university_has_program(program_id));

create policy students_read on students for select to authenticated using (
  public.is_aicte() or id = public.app_student_id() or public.institution_has_student(id));
create policy students_insert on students for insert to authenticated with check (
  public.is_institution_user() and created_by_institution_id = public.app_institution_id());
create policy students_update on students for update to authenticated using (
  public.is_institution_user() and public.institution_has_student(id)) with check (public.institution_has_student(id));

create policy enrolments_read on enrolments for select to authenticated using (
  public.is_aicte() or institution_id = public.app_institution_id() or student_id = public.app_student_id());
create policy enrolments_insert on enrolments for insert to authenticated with check (
  public.is_institution_user() and institution_id = public.app_institution_id());
create policy enrolments_update on enrolments for update to authenticated using (
  public.is_institution_user() and institution_id = public.app_institution_id())
  with check (institution_id = public.app_institution_id());

create policy enrolment_history_read on enrolment_history for select to authenticated using (
  public.is_aicte() or institution_id = public.app_institution_id());

create policy upload_batches_read on upload_batches for select to authenticated using (
  public.is_aicte() or institution_id = public.app_institution_id());
create policy upload_batches_insert on upload_batches for insert to authenticated with check (
  public.is_institution_user() and institution_id = public.app_institution_id());
create policy upload_batches_update on upload_batches for update to authenticated using (
  public.is_institution_user() and institution_id = public.app_institution_id())
  with check (institution_id = public.app_institution_id());

create policy validation_issues_read on validation_issues for select to authenticated using (
  public.is_aicte() or institution_id = public.app_institution_id());
create policy validation_issues_update on validation_issues for update to authenticated using (
  public.is_institution_user() and institution_id = public.app_institution_id())
  with check (institution_id = public.app_institution_id());

create policy cross_matches_read on cross_matches for select to authenticated using (public.is_aicte());
create policy fraud_clusters_read on fraud_clusters for select to authenticated using (public.is_aicte());
create policy alerts_read on alerts for select to authenticated using (public.is_aicte());
create policy notifications_read on notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on notifications for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy credentials_read on credentials for select to authenticated using (
  public.is_aicte() or public.institution_owns_enrolment(enrolment_id) or public.student_owns_enrolment(enrolment_id));
create policy revocations_read on revocations for select to authenticated using (public.is_aicte());

create policy verifier_orgs_read on verifier_orgs for select to authenticated using (
  public.is_aicte() or id = public.app_verifier_org_id());
create policy consents_read on consents for select to authenticated using (
  public.is_aicte() or student_id = public.app_student_id());
create policy access_log_read on access_log for select to authenticated using (
  public.is_aicte() or student_id = public.app_student_id());

create policy api_keys_read on api_keys for select to authenticated using (
  public.is_aicte() or institution_id = public.app_institution_id() or university_id = public.app_university_id());
create policy webhooks_read on webhooks for select to authenticated using (
  public.is_aicte() or owner_id = public.app_institution_id());
create policy webhook_deliveries_read on webhook_deliveries for select to authenticated using (
  public.is_aicte() or exists (select 1 from webhooks w where w.id = webhook_id and w.owner_id = public.app_institution_id()));

create policy audit_log_read on audit_log for select to authenticated using (public.is_aicte());
create policy audit_anchors_read on audit_anchors for select to authenticated using (public.is_aicte());
create policy approvals_read on approvals for select to authenticated using (public.is_aicte());

create policy university_results_read on university_results for select to authenticated using (
  public.is_aicte() or university_id = public.app_university_id() or apaar_hash = public.app_apaar_hash());
create policy university_batches_read on university_result_batches for select to authenticated using (
  public.is_aicte() or university_id = public.app_university_id());

create policy scholarship_requests_read on scholarship_requests for select to authenticated using (
  public.is_aicte() or apaar_hash = public.app_apaar_hash());
create policy marksheet_read on marksheet_submissions for select to authenticated using (
  public.is_aicte() or student_id = public.app_student_id() or public.institution_has_student(student_id));
create policy digilocker_read on simulated_digilocker for select to authenticated using (
  public.is_aicte() or student_id = public.app_student_id());
create policy sms_read on simulated_sms for select to authenticated using (student_id = public.app_student_id());
