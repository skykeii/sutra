"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import { ROLE_HOME, type AppRole } from "@/lib/auth/roles";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

const credentials = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
});

export interface LoginState {
  error?: string;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "Enter a valid email and password." };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return { error: "That email and password did not match." };

  const { data: profile } = await supabase.from("profiles").select("role").eq("user_id", data.user.id).maybeSingle();
  if (!profile) {
    await supabase.auth.signOut();
    return { error: "This account has no Sutra role yet. Contact AICTE support." };
  }

  const role = profile.role as AppRole;
  await appendAudit(createAdminSupabase(), {
    actorId: data.user.id,
    actorRole: role,
    action: "auth.login",
    entity: "session",
    entityId: data.user.id,
  });
  redirect(ROLE_HOME[role]);
}

export async function markNotificationsRead(): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  revalidatePath("/", "layout");
}

export async function logout(): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}
