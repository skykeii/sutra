-- Columns used by dashboard filters, joins and RLS policies. Existing unique indexes already cover the rest.
create index if not exists enrolments_institution_status_idx on enrolments(institution_id, enrolment_status);
create index if not exists enrolments_program_status_idx on enrolments(program_id, enrolment_status);
create index if not exists enrolments_batch_idx on enrolments(upload_batch_id);
create index if not exists enrolments_created_idx on enrolments(created_at);
create index if not exists programs_year_idx on programs(academic_year);
create index if not exists institutions_university_idx on institutions(university_id);
create index if not exists institutions_state_idx on institutions(state);
create index if not exists profiles_apaar_hash_idx on profiles(apaar_hash);
create index if not exists upload_batches_created_idx on upload_batches(institution_id, created_at desc);
create index if not exists validation_issues_rule_idx on validation_issues(institution_id, rule_code);
create index if not exists alerts_institution_idx on alerts(institution_id, status);
create index if not exists alerts_code_idx on alerts(code, status);
create index if not exists credentials_status_idx on credentials(status);
create index if not exists cross_matches_status_idx on cross_matches(status);
create index if not exists fraud_clusters_status_idx on fraud_clusters(status);
create index if not exists notifications_created_idx on notifications(user_id, created_at desc);
create index if not exists scholarship_requests_status_idx on scholarship_requests(status);
create index if not exists marksheet_student_idx on marksheet_submissions(student_id, outcome);
