do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table validation_issues, cross_matches, fraud_clusters, enrolments, audit_log, alerts;

-- These bypass nothing on their own, but anon and users have no reason to call internals directly.
revoke all on function public.snapshot_enrolment() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
