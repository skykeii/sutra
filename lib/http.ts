import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function jsonError(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, details: details ?? null } }, { status });
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

// Every route goes through here, so callers get one error shape and never a stack trace.
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) return jsonError(err.status, err.code, err.message, err.details);
      if (err instanceof ZodError) {
        return jsonError(400, "INVALID_INPUT", "Some of the information sent was not valid.", err.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
      }
      console.error("[api] unhandled error", req.nextUrl.pathname, err instanceof Error ? err.name : "unknown");
      return jsonError(500, "SERVER_ERROR", "Something went wrong on our side. Please try again.");
    }
  };
}

// Same-site cookies plus this check stop other sites from posting with a signed-in user's session.
export function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) {
    throw new ApiError(403, "BAD_ORIGIN", "This request came from another site.");
  }
}

export async function readJson(req: NextRequest, maxBytes = 25 * 1024 * 1024): Promise<unknown> {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > maxBytes) throw new ApiError(413, "TOO_LARGE", "This request is too large.");
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "The request body must be valid JSON.");
  }
}

export function fileResponse(body: BodyInit, contentType: string, fileName: string) {
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${fileName.replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "no-store",
    },
  });
}
