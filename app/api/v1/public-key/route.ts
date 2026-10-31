import { NextResponse } from "next/server";
import { PUBLIC_KEY_ID } from "@/lib/credentials/vc";

export function GET() {
  return NextResponse.json({ id: PUBLIC_KEY_ID, type: "Ed25519", publicKeyPem: process.env.ED25519_PUBLIC_KEY_PEM ?? null, canonicalisation: "JSON with sorted keys and no whitespace" });
}
