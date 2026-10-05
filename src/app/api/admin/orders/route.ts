import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withApi, jsonOk, parseBody } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { badRequest } from "@/lib/errors";
import type { OrderRow } from "@/components/admin/sales/OrdersClient";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/orders — admin order list.
 * Filters: q (order # / customer), status, payment status, page.
 */

const PAGE_SIZE = 20;

const ORDER_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
  "RETURNED",
  "FAILED",
] as const;

const PAYMENT_STATUSES = [
  "UNPAID",
  "PENDING",
  "PAID",
  "PARTIALLY_PAID",
  "REFUNDED",
  "FAILED",
] as const;

const querySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  payment: z.enum(PAYMENT_STATUSES).optional(),
  page: z.coerce.number().int().min(1).max(100000).optional(),
  /** "1" → the Delete history view (soft-deleted orders only). */
  deleted: z.enum(["0", "1"]).optional(),
});

export const GET = withApi(async (req: NextRequest) => {
  await requireAdmin();

  const sp = req.nextUrl.searchParams;
  // parseBody reused for query-string validation (same zod + 400 contract).
  const query = parseBody(querySchema, {
    q: sp.get("q") ?? undefined,
    status: sp.get("status") ?? undefined,
    payment: sp.get("payment") ?? undefined,
    page: sp.get("page") ?? undefined,
    deleted: sp.get("deleted") ?? undefined,
  });
  const page = query.page ?? 1;
  const historyView = query.deleted === "1";

  const where: Prisma.OrderWhereInput = {};
  // Soft-deleted rows are hidden from the live list and shown only in the
  // Delete history view (deleted=1).
  where.deletedAt = historyView ? { not: null } : null;
  if (query.q) {
    where.OR = [
      { orderNumber: { contains: query.q } },
      { customerName: { contains: query.q } },
      { customerPhone: { contains: query.q } },
      { customerEmail: { contains: query.q } },
    ];
  }
  if (query.status) where.status = query.status;
  if (query.payment) where.paymentStatus = query.payment;

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: historyView ? { deletedAt: "desc" } : { placedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        customerPhone: true,
        customerEmail: true,
        status: true,
        paymentMethod: true,
        paymentStatus: true,
        total: true,
        externalSyncStatus: true,
        placedAt: true,
        deletedAt: true,
        _count: { select: { items: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  const items: OrderRow[] = rows.map((r) => ({
    id: r.id,
    orderNumber: r.orderNumber,
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    customerEmail: r.customerEmail,
    status: r.status,
    paymentMethod: r.paymentMethod,
    paymentStatus: r.paymentStatus,
    total: Number(r.total),
    itemCount: r._count.items,
    externalSyncStatus: r.externalSyncStatus,
    placedAt: r.placedAt.toISOString(),
    deletedAt: r.deletedAt?.toISOString() ?? null,
  }));

  return jsonOk({
    items,
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
});
