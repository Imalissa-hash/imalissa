import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withApi, jsonOk, parseBody } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import type { SyncLogRow, SyncStats } from "@/components/admin/sales/SyncCenterClient";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/sync — sync log browser + stats.
 * Filters: status, direction, orderId, page.
 * `error` strings pass through the local scrub() helper before leaving
 * the server (defence in depth — snapshots are sanitized at write time).
 */

const PAGE_SIZE = 20;

const LOG_STATUSES = ["SUCCESS", "FAILED", "TIMEOUT", "SKIPPED", "NOT_CONFIGURED"] as const;
const DIRECTIONS = [
  "ORDER_PUSH",
  "STATUS_PULL",
  "PRODUCT_PULL",
  "STOCK_PULL",
  "PRICE_PULL",
  "CANCEL_PUSH",
  "VERIFY_IDEMPOTENCY",
] as const;

const querySchema = z.object({
  status: z.enum(LOG_STATUSES).optional(),
  direction: z.enum(DIRECTIONS).optional(),
  orderId: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().min(1).max(100000).optional(),
});

/* ── Scrub credential-looking material from free-text errors ── */
const BCRYPT = /\$2[aby]\$\d{2}\$[A-Za-z0-9./]{16,}/g;
const KEY_VALUE_PAIR =
  /([?&\s]?\b[\w-]*(?:password|token|secret|hash|credential|apikey)[\w-]*[=:])("[^"]*"|[^\s&"']+)/gi;

function scrub(value: string | null): string | null {
  if (!value) return value;
  return value.replace(BCRYPT, "[redacted]").replace(KEY_VALUE_PAIR, "$1[redacted]");
}

export const GET = withApi(async (req: NextRequest) => {
  await requireAdmin();

  const sp = req.nextUrl.searchParams;
  const query = parseBody(querySchema, {
    status: sp.get("status") ?? undefined,
    direction: sp.get("direction") ?? undefined,
    orderId: sp.get("orderId") ?? undefined,
    page: sp.get("page") ?? undefined,
  });
  const page = query.page ?? 1;

  const where: Prisma.ApiSyncLogWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.direction) where.direction = query.direction;
  if (query.orderId) where.orderId = query.orderId;

  const [rows, total, logGroups, orderGroups, directionRows] = await Promise.all([
    prisma.apiSyncLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        orderId: true,
        direction: true,
        status: true,
        attempt: true,
        error: true,
        durationMs: true,
        createdAt: true,
        order: {
          select: { orderNumber: true, customerName: true, externalSyncStatus: true },
        },
      },
    }),
    prisma.apiSyncLog.count({ where }),
    // KPI counts are over ALL logs (not the filtered set) so the strip
    // always shows the complete, honest picture.
    prisma.apiSyncLog.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.order.groupBy({
      by: ["externalSyncStatus"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.apiSyncLog.findMany({
      distinct: ["direction"],
      orderBy: { direction: "asc" },
      select: { direction: true },
    }),
  ]);

  const items: SyncLogRow[] = rows.map((r) => ({
    id: r.id,
    orderId: r.orderId,
    orderNumber: r.order.orderNumber,
    orderCustomer: r.order.customerName,
    orderSyncStatus: r.order.externalSyncStatus,
    direction: r.direction,
    status: r.status,
    attempt: r.attempt,
    error: scrub(r.error),
    durationMs: r.durationMs,
    createdAt: r.createdAt.toISOString(),
  }));

  const logs: Record<string, number> = Object.fromEntries(LOG_STATUSES.map((s) => [s, 0]));
  for (const g of logGroups) logs[g.status] = g._count._all;

  const orders: Record<string, number> = {
    NOT_CONFIGURED: 0,
    PENDING: 0,
    SYNCING: 0,
    SYNCED: 0,
    FAILED: 0,
    SYNC_TIMEOUT: 0,
  };
  for (const g of orderGroups) orders[g.externalSyncStatus] = g._count._all;

  const stats: SyncStats = { logs, orders };

  return jsonOk({
    items,
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    stats,
    directions: directionRows.map((d) => d.direction),
  });
});
