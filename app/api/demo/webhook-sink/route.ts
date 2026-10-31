import { NextResponse } from "next/server";

// Stands in for an institution's own endpoint so demos show a real delivery. It keeps nothing.
export async function POST() {
  if (process.env.DEMO_MODE !== "true") return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found.", details: null } }, { status: 404 });
  return NextResponse.json({ received: true });
}
