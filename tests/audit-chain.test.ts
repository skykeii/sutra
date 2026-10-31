import { describe, expect, it } from "vitest";
import { computeAuditHash, GENESIS_HASH, verifyChainChunk, type AuditChainEntry } from "@/lib/audit/chain";

function buildChain(n: number): AuditChainEntry[] {
  const chain: AuditChainEntry[] = [];
  let prev = GENESIS_HASH;
  for (let seq = 1; seq <= n; seq++) {
    const base = {
      seq,
      actor_id: null,
      actor_role: "system",
      action: "test.event",
      entity: "test",
      entity_id: String(seq),
      meta: { count: seq, code: "APAAR_FORMAT" },
      at_text: `2026-01-01T00:00:${String(seq % 60).padStart(2, "0")}.000000Z`,
    };
    const hash = computeAuditHash(prev, base);
    chain.push({ ...base, prev_hash: prev, hash });
    prev = hash;
  }
  return chain;
}

describe("audit hash chain", () => {
  it("accepts an intact chain", () => {
    expect(verifyChainChunk(buildChain(20))).toMatchObject({ ok: true, count: 20 });
  });

  it("can be verified in chunks", () => {
    const chain = buildChain(20);
    const first = verifyChainChunk(chain.slice(0, 7));
    expect(first.ok).toBe(true);
    if (first.ok) expect(verifyChainChunk(chain.slice(7), first.lastHash).ok).toBe(true);
  });

  it("pinpoints an edited entry", () => {
    const chain = buildChain(20);
    chain[11]!.meta = { count: 999 };
    expect(verifyChainChunk(chain)).toEqual({ ok: false, brokenAt: 12, count: 11 });
  });

  it("detects a deleted entry at the point of the gap", () => {
    const chain = buildChain(20);
    chain.splice(4, 1);
    expect(verifyChainChunk(chain)).toMatchObject({ ok: false, brokenAt: 6 });
  });

  it("does not accept a re-hashed entry whose successor still links to the old hash", () => {
    const chain = buildChain(5);
    chain[1]!.meta = { count: 999 };
    chain[1]!.hash = computeAuditHash(chain[1]!.prev_hash, chain[1]!);
    expect(verifyChainChunk(chain)).toMatchObject({ ok: false, brokenAt: 3 });
  });
});
