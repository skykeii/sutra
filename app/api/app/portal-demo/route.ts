import { NextResponse } from "next/server";
import { epassAdapter } from "@/lib/adapters/epass";
import { ApiError, assertSameOrigin, readJson, route } from "@/lib/http";
import { takeToken } from "@/lib/ratelimit";
import { scholarshipBody } from "@/lib/scholarship";
import { createAdminSupabase } from "@/lib/supabase/admin";

// Powers the simulated portal page only. Real portals use /api/v1/scholarship/verify with their own key.
export const POST = route(async (req) => {
  assertSameOrigin(req);
  if (process.env.DEMO_MODE !== "true") throw new ApiError(404, "NOT_FOUND", "Not found.");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!(await takeToken(`portal-demo:${ip}`, 60, 1))) throw new ApiError(429, "RATE_LIMITED", "Too many requests. Please slow down.");
  const input = scholarshipBody.parse(await readJson(req));
  const admin = createAdminSupabase();
  const { data: portal } = await admin.from("scholarship_portals").select("id").limit(1).single();
  if (!portal) throw new ApiError(500, "NO_PORTAL", "The simulated portal is not set up. Run npm run seed.");
  return NextResponse.json(await epassAdapter(admin, portal.id).apply(input));
});
