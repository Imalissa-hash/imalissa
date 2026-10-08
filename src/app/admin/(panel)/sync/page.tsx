import type { Metadata } from "next";
import type { Prisma, SyncDirection, SyncLogStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { SyncCenterClient } from "@/components/admin/sales/SyncCenterClient";
import type { SyncLogRow, SyncStats } from "@/components/admin/sales/SyncCenterClient";

import { pageGuard } from "@/components/admin/AccessDenied";
export const metadata: Metadata = {
  title: "Sync Center",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const LOG_STATUSES = ["SUCCESS", "FAILED", "TIMEOUT", "SKIPPED", "NOT_CONFIGURED"];
const DIRECTIONS = [
  "ORDER_PUSH",
  "STATUS_PULL",
  "PRODUCT_PULL",
  "STOCK_PULL",
  "PRICE_PULL",
  "CANCEL_PUSH",
  "VERIFY_IDEMPOTENCY",
];

const BCRYPT = /\$2[aby]\$\d{2}\$[A-Za-z0-9./]{16,}/g;
const KEY_VALUE_PAIR =
  /([?&\s]?\b[\w-]*(?:password|token|secret|hash|credential|apikey)[\w-]*[=:])("[^"]*"|[^\s&"']+)/gi;

function scrub(value: string | null): string | null {
  if (!value) return value;
  return value.replace(BCRYPT, "[redacted]").replace(KEY_VALUE_PAIR, "$1[redacted]");
}

/** Sync Center — KPI strip + filterable log table, server-rendered. */
export default async function AdminSyncPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const denied = await pageGuard("sync.view");
  if (denied) return denied;

  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v : "";
  };

  const status = LOG_STATUSES.includes(one("status")) ? one("status") : "";
  const direction = DIRECTIONS.includes(one("direction")) ? one("direction") : "";
  const orderId = one("orderId").trim();
  const requestedPage = Math.max(1, Number(one("page")) || 1);

  const where: Prisma.ApiSyncLogWhereInput = {};
  if (status) where.status = status as SyncLogStatus;
  if (direction) where.direction = direction as SyncDirection;
  if (orderId) where.orderId = orderId;

  const [rows, total, logGroups, orderGroups, directionRows] = await Promise.all([
    prisma.apiSyncLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (requestedPage - 1) * PAGE_SIZE,
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
        order: { select: { orderNumber: true, customerName: true, externalSyncStatus: true } },
      },
    }),
    prisma.apiSyncLog.count({ where }),
    prisma.apiSyncLog.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.order.groupBy({ by: ["externalSyncStatus"], where: { deletedAt: null }, _count: { _all: true } }),
    prisma.apiSyncLog.findMany({
      distinct: ["direction"],
      orderBy: { direction: "asc" },
      select: { direction: true },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

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
  const directions = directionRows.map((d) => d.direction);

  return (
    <div>
      <AdminPageHeader
        title="Sync Center"
        subtitle="Every external push / pull attempt — failures and timeouts are never hidden"
      />
      <SyncCenterClient
        items={items}
        total={total}
        totalPages={totalPages}
        page={page}
        searchParams={sp}
        stats={stats}
        directions={directions}
      />
    </div>
  );
}
