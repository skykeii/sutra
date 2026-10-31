-- Supabase's safeupdate guard rejects a DELETE with no WHERE clause when called through the API.
create or replace function public.demo_restore_audit() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform set_config('sutra.demo_bypass', 'on', true);
  update audit_log a set meta = b.meta from audit_tamper_backup b where a.seq = b.seq;
  get diagnostics n = row_count;
  perform set_config('sutra.demo_bypass', 'off', true);
  delete from audit_tamper_backup where seq is not null;
  return n;
end $$;
revoke all on function public.demo_restore_audit() from public, anon, authenticated;
grant execute on function public.demo_restore_audit() to service_role;
