import { revalidateTag } from "next/cache";

export const AICTE_AGGREGATES_TAG = "aicte-aggregates";

// Called after a write, so a live dashboard refresh never shows numbers that predate it.
export function invalidateAggregates() {
  try {
    revalidateTag(AICTE_AGGREGATES_TAG);
  } catch {
    // Outside a Next request there is no cache to clear, and entries expire within 30 seconds anyway.
  }
}
