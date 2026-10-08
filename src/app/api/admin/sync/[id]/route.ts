import { NextRequest } from "next/server";
import { withApi, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { notFound } from "@/lib/errors";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const idFrom = async (ctx?: Ctx): Promise<string> => (await ctx?.params)?.id ?? "";

/* ── Redaction (same contract as /api/admin/audit) ──────────── */

const SECRET_KEY = /password|token|secret|hash|credential|apikey|api[-_]?key|authorization/i;
const BCRYPT = /\$2[aby]\$\d{2}\$[A-Za-z0-9./]{16,}/g;
const KEY_VALUE_PAIR =
  /([?&\s]?\b[\w-]*(?:password|token|secret|hash|credential|apikey)[\w-]*[=:])("[^"]*"|[^\s&"']+)/gi;

function scrubString(s: string): string {
  return s.replace(BCRYPT, "[redacted]").replace(KEY_VALUE_PAIR, "$1[redacted]");
}

/**
 * Deep-walk a stored snapshot and strip credential-looking material.
 * Snapshots are already sanitized before persisting (external-commerce
 * config.sanitize) — this is defence in depth before leaving the server.
 * Returns pretty-printed JSON for the detail modal.
 */
function redact(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      try {
        const parsed = JSON.parse(v);
        if (parsed && typeof parsed === "object") return walk(parsed);
      } catch {
        /* plain string */
      }
      return scrubString(v);
    }
    if (Array.isArray(v)) return v.map(walk);
    if (typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        out[k] = SECRET_KEY.test(k) ? "[redacted]" : walk(val);
      }
      return out;
    }
    return v;
  };

  try {
    const walked = walk(value);
    return typeof walked === "string" ? walked : JSON.stringify(walked, null, 2);
  } catch {
    return "[payload unavailable]";
  }
}

/**
 * GET /api/admin/sync/[id] — single sync log detail.
 * Request/response bodies are redacted server-side before leaving the API.
 */
export const GET = withApi<Ctx>(async (req: NextRequest, ctx?: Ctx) => {
  await requirePermission("sync.view");
  const id = await idFrom(ctx);
  if (!id) throw notFound("Sync log not found");

  const log = await prisma.apiSyncLog.findUnique({
    where: { id },
    include: {
      order: {
        select: {
          orderNumber: true,
          customerName: true,
          status: true,
          externalSyncStatus: true,
          externalOrderId: true,
        },
      },
    },
  });
  if (!log) throw notFound("Sync log not found");

  return jsonOk({
    id: log.id,
    orderId: log.orderId,
    orderNumber: log.order.orderNumber,
    customerName: log.order.customerName,
    orderStatus: log.order.status,
    orderSyncStatus: log.order.externalSyncStatus,
    externalOrderId: log.order.externalOrderId,
    direction: log.direction,
    status: log.status,
    attempt: log.attempt,
    durationMs: log.durationMs,
    error: log.error ? scrubString(log.error) : null,
    request: redact(log.request),
    response: redact(log.response),
    createdAt: log.createdAt.toISOString(),
  });
});
