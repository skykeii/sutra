import type { SupabaseClient } from "@supabase/supabase-js";
import { chunked } from "@/lib/db";

export interface ApaarRecord {
  name: string;
  dob: string;
  gender: string;
  valid: boolean;
}

export interface ApaarAdapter {
  lookup(apaarId: string): Promise<ApaarRecord>;
  lookupMany(apaarIds: string[]): Promise<Map<string, { name: string; dob: string; gender: string }>>;
}

// Real integration: swap this for the national APAAR/ABC registry API once AICTE grants access.
export function apaarAdapter(admin: SupabaseClient): ApaarAdapter {
  return {
    async lookup(apaarId) {
      const { data } = await admin.from("mock_apaar_registry").select("name, dob, gender").eq("apaar_id", apaarId).maybeSingle();
      return data ? { ...data, valid: true } : { name: "", dob: "", gender: "", valid: false };
    },
    async lookupMany(apaarIds) {
      const out = new Map<string, { name: string; dob: string; gender: string }>();
      for (const part of chunked(apaarIds)) {
        const { data, error } = await admin.from("mock_apaar_registry").select("apaar_id, name, dob, gender").in("apaar_id", part);
        if (error) throw new Error(`APAAR lookup failed: ${error.message}`);
        data?.forEach((r) => out.set(r.apaar_id, { name: r.name, dob: r.dob, gender: r.gender }));
      }
      return out;
    },
  };
}
