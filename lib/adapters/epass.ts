import type { SupabaseClient } from "@supabase/supabase-js";
import { processScholarship, type ScholarshipOutcome } from "@/lib/scholarship";

export interface EpassAdapter {
  apply(input: { apaar_id: string; scheme: string; request_id?: string }): Promise<ScholarshipOutcome>;
}

// Real integration: a state's ePASS system would call /api/v1/scholarship/verify with its own API key.
export function epassAdapter(admin: SupabaseClient, portalId: string): EpassAdapter {
  return { apply: (input) => processScholarship(admin, portalId, input) };
}
