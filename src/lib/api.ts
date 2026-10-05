import { NextRequest, NextResponse } from "next/server";
import type { ZodSchema } from "zod";
import { ApiError, publicMessage, tooMany, forbidden } from "./errors";

/** JSON success response. */
export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, data }, init);
}

/** JSON error response (never leaks internals). */
export function jsonError(status: number, message: string, details?: unknown): NextResponse {
  return NextResponse.json({ ok: false, message, ...(details !== undefined ? { details } : {}) }, { status });
}

/**
 * CSRF protection: for state-changing requests, require that the Origin
 * (or Referer) header matches the host we are serving. Session cookies
 * are SameSite=Lax as a second layer.
 */
export function assertSameOrigin(req: NextRequest): void {
  const method = req.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;

  const host = req.headers.get("host");
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");

  let source = origin;
  if (!source && referer) {
    try {
      source = new URL(referer).origin;
    } catch {
      source = null;
    }
  }

  // If neither header exists (non-browser client), reject mutating calls.
  if (!source || !host) {
    throw forbidden("Missing origin header");
  }

  let sourceHost: string;
  try {
    sourceHost = new URL(source).host;
  } catch {
    throw forbidden("Invalid origin");
  }

  if (sourceHost !== host) {
    throw forbidden("Cross-origin request blocked");
  }
}

/**
 * Simple in-memory fixed-window rate limiter.
 * Good for a single Node process. For multi-instance deployments,
 * swap the store for Redis (see docs/SECURITY.md notes in README).
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 5000) {
      // crude cleanup to bound memory
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
    return;
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    throw tooMany(`Too many requests. Try again in ${retryAfter}s.`);
  }
}

/** Validate request body with Zod, returning typed data or throwing ApiError(400). */
export function parseBody<T>(schema: ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const field = first?.path?.join(".") ;
    const msg = first ? `${field ? `${field}: ` : ""}${first.message}` : "Invalid input";
    throw new ApiError(400, msg, result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  return result.data;
}

/**
 * Wrap a route handler with unified error handling + same-origin check.
 * Usage:
 *   export const POST = withApi(async (req) => { ... return jsonOk(...) })
 */
export function withApi<T>(
  handler: (req: NextRequest, ctx: T) => Promise<NextResponse>,
  opts: { sameOrigin?: boolean } = {}
) {
  // ctx is REQUIRED in the signature (not optional): Next's generated
  // route-type check rejects `Ctx | undefined` as a second parameter.
  // Callers that ignore ctx simply omit the parameter — TS allows that.
  return async (req: NextRequest, ctx: T): Promise<NextResponse> => {
    try {
      if (opts.sameOrigin !== false) assertSameOrigin(req);
      return await handler(req, ctx);
    } catch (err) {
      const { status, message } = publicMessage(err);
      const details = err instanceof ApiError ? err.details : undefined;
      return jsonError(status, message, details);
    }
  };
}

/** Client IP for rate limiting / audit (best effort behind proxies). */
export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local"
  );
}
