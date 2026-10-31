import type { SupabaseClient } from "@supabase/supabase-js";

export interface DigilockerAdapter {
  pushRecord(input: { studentId: string; recordId: string }): Promise<{ simulated: boolean }>;
}

// Real integration: swap this for the DigiLocker Issuer API once AICTE is onboarded as an issuer.
export function digilockerAdapter(admin: SupabaseClient): DigilockerAdapter {
  return {
    async pushRecord({ studentId, recordId }) {
      const { error } = await admin.from("simulated_digilocker").upsert({ student_id: studentId, record_id: recordId }, { onConflict: "student_id,record_id" });
      if (error) throw new Error(`Simulated DigiLocker push failed: ${error.message}`);
      return { simulated: true };
    },
  };
}
