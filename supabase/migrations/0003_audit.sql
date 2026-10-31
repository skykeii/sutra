create table audit_log (
  seq bigserial primary key,
  actor_id uuid,
  actor_role text,
  action text not null,
  entity text not null,
  entity_id text,
  meta jsonb not null default '{}',
  prev_hash text not null,
  hash text not null,
  at timestamptz not null default now()
);
create index audit_log_action_idx on audit_log(action);
create index audit_log_at_idx on audit_log(at);

create table audit_anchors (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  last_seq bigint not null,
  last_hash text not null,
  signature text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger audit_anchors_updated_at before update on audit_anchors
  for each row execute function public.set_updated_at();

-- Holds the original row while the demo tamper is active.
create table audit_tamper_backup (
  seq bigint primary key,
  meta jsonb not null,
  created_at timestamptz not null default now()
);

-- The advisory lock serialises writers so seq and prev_hash cannot race.
create function public.append_audit(
  p_actor_id uuid,
  p_actor_role text,
  p_action text,
  p_entity text,
  p_entity_id text,
  p_meta jsonb default '{}',
  p_at timestamptz default now()
) returns audit_log
language plpgsql security definer set search_path = public as $$
declare
  v_prev text;
  v_seq bigint;
  v_canon text;
  v_row audit_log;
begin
  perform pg_advisory_xact_lock(727001);
  select hash into v_prev from audit_log order by seq desc limit 1;
  v_prev := coalesce(v_prev, repeat('0', 64));
  v_seq := nextval(pg_get_serial_sequence('public.audit_log', 'seq'));
  v_canon := public.canonical_json(jsonb_build_object(
    'seq', v_seq, 'actor_id', p_actor_id, 'actor_role', p_actor_role, 'action', p_action,
    'entity', p_entity, 'entity_id', p_entity_id, 'meta', coalesce(p_meta, '{}'::jsonb),
    'at', public.audit_at_text(p_at)));
  insert into audit_log (seq, actor_id, actor_role, action, entity, entity_id, meta, prev_hash, hash, at)
  values (v_seq, p_actor_id, p_actor_role, p_action, p_entity, p_entity_id, coalesce(p_meta, '{}'::jsonb), v_prev,
          encode(sha256(convert_to(v_prev || v_canon, 'UTF8')), 'hex'), p_at)
  returning * into v_row;
  return v_row;
end $$;

-- Append-only. The only exception is the demo flag, settable solely inside demo_tamper_audit/demo_restore_audit.
create function public.audit_log_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and current_setting('sutra.demo_bypass', true) = 'on' then
    return new;
  end if;
  raise exception 'audit_log is append-only (% blocked)', tg_op;
end $$;
create trigger audit_log_no_update before update on audit_log
  for each row execute function public.audit_log_immutable();
create trigger audit_log_no_delete before delete on audit_log
  for each row execute function public.audit_log_immutable();
create trigger audit_log_no_truncate before truncate on audit_log
  for each statement execute function public.audit_log_immutable();

create function public.demo_tamper_audit(p_seq bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_tamper_backup (seq, meta)
    select seq, meta from audit_log where seq = p_seq
    on conflict (seq) do nothing;
  perform set_config('sutra.demo_bypass', 'on', true);
  update audit_log set meta = meta || '{"tampered":true}'::jsonb where seq = p_seq;
  perform set_config('sutra.demo_bypass', 'off', true);
end $$;

create function public.demo_restore_audit() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform set_config('sutra.demo_bypass', 'on', true);
  update audit_log a set meta = b.meta from audit_tamper_backup b where a.seq = b.seq;
  get diagnostics n = row_count;
  perform set_config('sutra.demo_bypass', 'off', true);
  delete from audit_tamper_backup;
  return n;
end $$;

-- at_text gives integrity checkers the exact string that was hashed.
create view v_audit_chain with (security_invoker = true) as
  select seq, actor_id, actor_role, action, entity, entity_id, meta, prev_hash, hash, at,
         public.audit_at_text(at) as at_text
  from audit_log;

revoke all on audit_log from public, anon, authenticated, service_role;
revoke all on audit_tamper_backup from public, anon, authenticated, service_role;
revoke all on function public.append_audit(uuid, text, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.demo_tamper_audit(bigint) from public, anon, authenticated;
revoke all on function public.demo_restore_audit() from public, anon, authenticated;
revoke all on function public.audit_log_immutable() from public, anon, authenticated;
grant execute on function public.append_audit(uuid, text, text, text, text, jsonb, timestamptz) to service_role;
grant execute on function public.demo_tamper_audit(bigint) to service_role;
grant execute on function public.demo_restore_audit() to service_role;
grant select on audit_log to authenticated, service_role;
