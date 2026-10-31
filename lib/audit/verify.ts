import type { SupabaseClient } from "@supabase/supabase-js";
import { GENESIS_HASH, verifyChainChunk, type AuditChainEntry } from "@/lib/audit/chain";

export type IntegrityResult = { ok: true; count: number; lastHash: string; checkedAt: string } | { ok: false; count: number; brokenAt: number; checkedAt: string };

/** Recomputes the whole chain in this process, one chunk at a time, so memory stays flat. */
export async function verifyFullChain(admin: SupabaseClient): Promise<IntegrityResult> {
  let prev = GENESIS_HASH;
  let after = 0;
  let count = 0;
  for (;;) {
    const { data, error } = await admin.from("v_audit_chain").select("*").gt("seq", after).order("seq").limit(1000);
    if (error) throw new Error(`Could not read the audit chain: ${error.message}`);
    if (!data?.length) break;
    const result = verifyChainChunk(data as AuditChainEntry[], prev);
    if (!result.ok) return { ok: false, count: count + result.count, brokenAt: result.brokenAt, checkedAt: new Date().toISOString() };
    prev = result.lastHash;
    count += result.count;
    after = data[data.length - 1]!.seq;
  }
  return { ok: true, count, lastHash: prev, checkedAt: new Date().toISOString() };
}

export async function runIntegrityCheck(admin: SupabaseClient): Promise<IntegrityResult> {
  const result = await verifyFullChain(admin);
  await admin.from("app_cache").upsert({ key: "integrity", value: result, updated_at: new Date().toISOString() });
  return result;
}
