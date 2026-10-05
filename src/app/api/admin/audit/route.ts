import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withApi, jsonOk, parseBody } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * Audit log API — read-only listing with filters + pagination.
 * Never returns password material: `details` always passes through the
 * local redact() helper before it leaves the server.
 */

const PAGE_SIZE = 25;

/* ── Redaction ────────────────────────────────────────────────────── */

const SECRET_KEY = /password|token|secret|hash|credential|apikey|api[-_]?key/i;
const BCRYPT = /\$2[aby]\$\d{2}\$[A-Za-z0-9./]{16,}/g;
const KEY_VALUE_PAIR = /([?&\s]?\b[\w-]*(?:password|token|secret|hash|credential|apikey)[\w-]*[=:])("[^"]*"|[^\s&"']+)/gi;

function scrubString(s: string): string {
  return s.replace(BCRYPT, "[redacted]").replace(KEY_VALUE_PAIR, "$1[redacted]");
}

/**
 * Deep-walk audit details and strip credential-looking material:
 *  - object keys matching /password|token|secret|hash|credential|apikey/i
 *    have their values replaced with "[redacted]",
 *  - strings are scrubbed of bcrypt hashes and `token=...` style pairs
 *    (including JSON blobs embedded as strings),
 *  - the result is pretty-printed JSON for the detail modal.
 */
function redact(details: unknown): string | null {
  if (details === null || details === undefined) return null;

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
    const walked = walk(details);
    return typeof walked === "string" ? walked : JSON.stringify(walked, null, 2);
  } catch {
    return "[details unavailable]";
  }
}

/* ── Query ────────────────────────────────────────────────────────── */

const querySchema = z.object({
  q: z.string().trim().max(100).optional(),
  adminId: z.string().max(64).optional(),
  action: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().min(1).max(100000).optional(),
});

/**
 * GET /api/admin/audit?q=&adminId=&action=&page=
 * `action` is a PREFIX filter (e.g. PRODUCT, ORDER, SETTINGS) and the
 * response carries the distinct `actions` list so the UI can build the
 * filter select from real data.
 */
export const GET = withApi(async (req: NextRequest) => {
  await requireAdmin();

  const sp = req.nextUrl.searchParams;
  // parseBody reused for query-string validation (same zod + 400 errors).
  const query = parseBody(querySchema, {
    q: sp.get("q") ?? undefined,
    adminId: sp.get("adminId") ?? undefined,
    action: sp.get("action") ?? undefined,
    page: sp.get("page") ?? undefined,
  });
  const page = query.page ?? 1;

  const where: Prisma.AuditLogWhereInput = {};
  if (query.q) {
    where.OR = [
      { action: { contains: query.q } },
      { entityId: { contains: query.q } },
      { entityType: { contains: query.q } },
    ];
  }
  if (query.adminId) where.adminId = query.adminId;
  if (query.action) where.action = { startsWith: query.action };

  const [rows, total, distinctActions, admins] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        details: true,
        ip: true,
        userAgent: true,
        createdAt: true,
        admin: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ distinct: ["action"], orderBy: { action: "asc" }, select: { action: true } }),
    prisma.adminUser.findMany({
      where: { auditLogs: { some: {} } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const items = rows.map((r) => ({
    id: r.id,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    details: redact(r.details),
    ip: r.ip,
    userAgent: r.userAgent,
    createdAt: r.createdAt,
    admin: r.admin,
  }));

  return jsonOk({
    items,
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    actions: distinctActions.map((a) => a.action),
    admins,
  });
});

export const dynamic = "force-dynamic";
