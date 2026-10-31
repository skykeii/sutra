import { NextResponse } from "next/server";
import { openApiDocument } from "@/lib/openapi";

export function GET() {
  return NextResponse.json(openApiDocument());
}
