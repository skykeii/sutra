import { canonicalJSON, sha256Hex } from "@/lib/crypto";

export const GENESIS_HASH = "0".repeat(64);

export interface AuditChainEntry {
  seq: number;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  meta: unknown;
  at_text: string;
  prev_hash: string;
  hash: string;
}

export function computeAuditHash(prevHash: string, e: Omit<AuditChainEntry, "prev_hash" | "hash">): string {
  const canon = canonicalJSON({
    seq: e.seq,
    actor_id: e.actor_id,
    actor_role: e.actor_role,
    action: e.action,
    entity: e.entity,
    entity_id: e.entity_id,
    meta: e.meta,
    at: e.at_text,
  });
  return sha256Hex(prevHash + canon);
}

export type ChainResult = { ok: true; lastHash: string; count: number } | { ok: false; brokenAt: number; count: number };

// Accepts one chunk at a time so callers can stream the whole chain.
export function verifyChainChunk(entries: AuditChainEntry[], prevHash = GENESIS_HASH): ChainResult {
  let prev = prevHash;
  let count = 0;
  for (const entry of entries) {
    if (entry.prev_hash !== prev || computeAuditHash(prev, entry) !== entry.hash) {
      return { ok: false, brokenAt: entry.seq, count };
    }
    prev = entry.hash;
    count += 1;
  }
  return { ok: true, lastHash: prev, count };
}
