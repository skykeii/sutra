-- All views run as the caller, so RLS scopes them per role.
create view v_intake_status with (security_invoker = true) as
  select p.id as program_id, p.institution_id, i.name as institution_name, i.state, p.name as program_name, p.level,
         p.academic_year, p.approved_intake as approved, p.supernumerary_cap,
         count(e.id) filter (where e.enrolment_status = 'Active' and e.quota_type <> 'SUPERNUMERARY')::int as enrolled_regular,
         count(e.id) filter (where e.enrolment_status = 'Active' and e.quota_type = 'SUPERNUMERARY')::int as enrolled_supernumerary,
         round(100.0 * count(e.id) filter (where e.enrolment_status = 'Active' and e.quota_type <> 'SUPERNUMERARY') / p.approved_intake, 1) as fill_pct
  from programs p
  join institutions i on i.id = p.institution_id
  left join enrolments e on e.program_id = p.id
  group by p.id, i.name, i.state;

create view v_quota_status with (security_invoker = true) as
  select s.program_id, p.institution_id, p.name as program_name, s.quota_type, s.seats_allowed,
         count(e.id) filter (where e.enrolment_status = 'Active')::int as enrolled,
         count(e.id) filter (where e.enrolment_status = 'Active') > s.seats_allowed as over_quota
  from seat_matrix s
  join programs p on p.id = s.program_id
  left join enrolments e on e.program_id = s.program_id and e.quota_type = s.quota_type
  group by s.id, p.institution_id, p.name;

create view v_state_summary with (security_invoker = true) as
  select i.state, count(distinct i.id)::int as institutions,
         coalesce(sum(v.approved), 0)::int as approved,
         coalesce(sum(v.enrolled_regular), 0)::int as enrolled_regular,
         coalesce(sum(v.enrolled_supernumerary), 0)::int as enrolled_supernumerary,
         round(100.0 * coalesce(sum(v.enrolled_regular), 0) / nullif(sum(v.approved), 0), 1) as fill_pct,
         (select count(*)::int from alerts a join institutions ai on ai.id = a.institution_id
          where ai.state = i.state and a.status = 'Open') as open_alerts
  from institutions i
  left join v_intake_status v on v.institution_id = i.id
  group by i.state;

create view v_category_summary with (security_invoker = true) as
  select i.state,
         count(*) filter (where s.is_nri)::int as nri,
         count(*) filter (where s.oci_status = 'holder')::int as oci,
         count(*) filter (where s.is_foreign_national)::int as foreign_national,
         count(*)::int as total
  from enrolments e
  join students s on s.id = e.student_id
  join institutions i on i.id = e.institution_id
  where e.enrolment_status = 'Active'
  group by i.state;

create view v_submission_status with (security_invoker = true) as
  select i.id as institution_id, i.name as institution_name, i.state,
         (select count(*)::int from programs p where p.institution_id = i.id) as programs,
         (select count(*)::int from upload_batches b where b.institution_id = i.id and b.status = 'Submitted') as batches_submitted,
         (select max(b.created_at) from upload_batches b where b.institution_id = i.id and b.status = 'Submitted') as last_submitted_at,
         (select count(*)::int from enrolments e where e.institution_id = i.id and e.enrolment_status = 'Active') as active_enrolments,
         exists (select 1 from upload_batches b where b.institution_id = i.id and b.status = 'Submitted') as has_submitted
  from institutions i;

-- Non-supernumerary quotas must add up to approved intake.
create function public.seat_matrix_valid(p_program uuid) returns boolean
language sql stable set search_path = public as $$
  select coalesce(sum(s.seats_allowed), 0) = (select approved_intake from programs where id = p_program)
  from seat_matrix s
  where s.program_id = p_program and s.quota_type <> 'SUPERNUMERARY'
$$;

revoke all on v_intake_status, v_quota_status, v_state_summary, v_category_summary, v_submission_status from public, anon;
grant select on v_intake_status, v_quota_status, v_state_summary, v_category_summary, v_submission_status to authenticated, service_role;
