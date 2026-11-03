-- Ties each access entry to the consent that allowed it.
alter table access_log add column consent_id uuid references consents(id) on delete set null;
create index access_log_consent_idx on access_log(consent_id);

-- One-time use: consumes the consent and records the access in the same transaction.
-- Returns false if the consent was not usable, including when another request used it first.
create function public.consume_consent(p_consent uuid, p_who uuid, p_grantee text, p_fields text[], p_receipt jsonb)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid;
  v_purpose text;
begin
  update consents set consumed_at = now(), receipt = coalesce(p_receipt, receipt)
    where id = p_consent and approved_at is not null and consumed_at is null and denied_at is null and revoked_at is null
      and (expires_at is null or expires_at > now())
    returning student_id, purpose into v_student, v_purpose;
  if not found then
    return false;
  end if;
  insert into access_log (who, grantee, student_id, fields_returned, purpose, consent_id)
    values (p_who, p_grantee, v_student, p_fields, v_purpose, p_consent);
  return true;
end $$;
revoke all on function public.consume_consent(uuid, uuid, text, text[], jsonb) from public, anon, authenticated;
grant execute on function public.consume_consent(uuid, uuid, text, text[], jsonb) to service_role;

-- Students read their own rows under the existing policies, so Realtime may send them their own changes.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'consents') then
    alter publication supabase_realtime add table consents;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'access_log') then
    alter publication supabase_realtime add table access_log;
  end if;
end $$;
