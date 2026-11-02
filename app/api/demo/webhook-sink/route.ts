import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp } from "@/lib/client-ip";
import { decryptField } from "@/lib/crypto";
import { ApiError, route } from "@/lib/http";
import { takeToken } from "@/lib/ratelimit";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { webhookSignatureValid } from "@/lib/webhook-guard";

const MAX_BYTES = 16 * 1024;

async function readCapped(req: Request): Promise<string> {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES) throw new ApiError(413, "TOO_LARGE", "This request is too large.");
  const parts: Uint8Array[] = [];
  let size = 0;
  const reader = req.body?.getReader();
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new ApiError(413, "TOO_LARGE", "This request is too large.");
    }
    parts.push(value);
  }
  return Buffer.concat(parts).toString("utf8");
}

// Stands in for an institution's own endpoint so demos show a real signed delivery. It keeps nothing:
// the sender records the delivery's status in webhook_deliveries, and the payload is dropped here.
export const POST = route(async (req) => {
  if (process.env.DEMO_MODE !== "true") throw new ApiError(404, "NOT_FOUND", "Not found.");
  if (!(await takeToken(`sink:${clientIp(req.headers)}`, 60, 1))) throw new ApiError(429, "RATE_LIMITED", "Too many requests. Please slow down.");
  const body = await readCapped(req);
  try {
    JSON.parse(body);
  } catch {
    throw new ApiError(400, "INVALID_JSON", "The request body must be valid JSON.");
  }
  const id = z.uuid().safeParse(req.headers.get("x-webhook-id"));
  const { data: hook } = id.success ? await createAdminSupabase().from("webhooks").select("secret_enc").eq("id", id.data).maybeSingle() : { data: null };
  if (!hook || !webhookSignatureValid(decryptField(hook.secret_enc), body, req.headers.get("x-signature") ?? "")) {
    throw new ApiError(401, "BAD_SIGNATURE", "This signature did not match the registered webhook.");
  }
  return NextResponse.json({ received: true });
});
