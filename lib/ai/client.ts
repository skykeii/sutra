import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAudit } from "@/lib/audit";

export const AI_MODEL = "claude-sonnet-4-6";

// Only an explicit key turns AI on. Every caller has a deterministic fallback for when this is false.
export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY;

interface AiCall {
  templateId: string;
  system: string;
  user: string;
  maxTokens: number;
  schema?: Record<string, unknown>;
}

/**
 * SAFETY: callers pass only aggregates, counts, rule codes and masked tokens, never student data.
 * Returns null on any failure, so callers fall back. The audit stores the template id, not the content.
 */
export async function callClaude(admin: SupabaseClient, call: AiCall): Promise<string | null> {
  if (!aiEnabled()) return null;
  let outcome = "ok";
  try {
    const response = await new Anthropic({ timeout: 20_000, maxRetries: 1 }).messages.create({
      model: AI_MODEL,
      max_tokens: call.maxTokens,
      system: call.system,
      messages: [{ role: "user", content: call.user }],
      ...(call.schema ? { output_config: { format: { type: "json_schema" as const, schema: call.schema } } } : {}),
    });
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      outcome = response.stop_reason;
      return null;
    }
    return response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("").trim() || null;
  } catch (error) {
    outcome = error instanceof Anthropic.APIError ? `api_error_${error.status ?? "unknown"}` : "failed";
    return null;
  } finally {
    await appendAudit(admin, { actorRole: "system", action: "ai.call", entity: "ai", entityId: call.templateId, meta: { template: call.templateId, model: AI_MODEL, outcome } });
  }
}
