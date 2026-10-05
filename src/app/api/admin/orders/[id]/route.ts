import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withApi, jsonOk, parseBody, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { notFound, conflict } from "@/lib/errors";
import type { OrderDetail } from "@/components/admin/sales/OrderDetailClient";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const idFrom = async (ctx?: Ctx): Promise<string> => (await ctx?.params)?.id ?? "";

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

const patchSchema = z.object({
  status: z.enum(ORDER_STATUSES),
});

const fullInclude = {
  items: { orderBy: { id: "asc" as const } },
  payments: { orderBy: { createdAt: "desc" as const } },
  user: { select: { id: true, name: true, email: true, phone: true, status: true } },
  syncLogs: {
    orderBy: { createdAt: "desc" as const },
    take: 30,
    select: {
      id: true,
      direction: true,
      status: true,
      attempt: true,
      error: true,
      durationMs: true,
      createdAt: true,
    },
  },
} satisfies object;

type FullOrder = Prisma.OrderGetPayload<{ include: typeof fullInclude }>;

function serialize(order: FullOrder): OrderDetail {
  const address = (order.address ?? null) as Record<string, unknown> | null;
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    userId: order.userId,
    user: order.user,
    guestEmail: order.guestEmail,
    guestPhone: order.guestPhone,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerEmail: order.customerEmail,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    subtotal: Number(order.subtotal),
    discount: Number(order.discount),
    couponCode: order.couponCode,
    deliveryCharge: Number(order.deliveryCharge),
    total: Number(order.total),
    address: address as unknown as OrderDetail["address"],
    instructions: order.instructions,
    customerNote: order.customerNote,
    adminNotes: order.adminNotes,
    externalOrderId: order.externalOrderId,
    externalSyncStatus: order.externalSyncStatus,
    syncAttempts: order.syncAttempts,
    syncStartedAt: order.syncStartedAt?.toISOString() ?? null,
    syncedAt: order.syncedAt?.toISOString() ?? null,
    lastSyncError: order.lastSyncError,
    trackingNumber: order.trackingNumber,
    trackingUrl: order.trackingUrl,
    placedAt: order.placedAt.toISOString(),
    confirmedAt: order.confirmedAt?.toISOString() ?? null,
    shippedAt: order.shippedAt?.toISOString() ?? null,
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    updatedAt: order.updatedAt.toISOString(),
    items: order.items.map((i) => ({
      id: i.id,
      productName: i.productName,
      sku: i.sku,
      variantLabel: i.variantLabel,
      image: i.image,
      unitPrice: Number(i.unitPrice),
      lineDiscount: Number(i.lineDiscount),
      quantity: i.quantity,
      lineTotal: Number(i.lineTotal),
    })),
    payments: order.payments.map((p) => ({
      id: p.id,
      method: p.method,
      amount: Number(p.amount),
      status: p.status,
      transactionId: p.transactionId,
      createdAt: p.createdAt.toISOString(),
    })),
    syncLogs: order.syncLogs.map((l) => ({
      id: l.id,
      direction: l.direction,
      status: l.status,
      attempt: l.attempt,
      error: l.error,
      durationMs: l.durationMs,
      createdAt: l.createdAt.toISOString(),
    })),
  };
}

// ── GET /api/admin/orders/[id] — full detail ──────────────
export const GET = withApi<Ctx>(async (req: NextRequest, ctx?: Ctx) => {
  await requireAdmin();
  const id = await idFrom(ctx);
  if (!id) throw notFound("Order not found");

  const order = await prisma.order.findUnique({ where: { id }, include: fullInclude });
  if (!order) throw notFound("Order not found");

  return jsonOk(serialize(order));
});

// ── PATCH /api/admin/orders/[id] — status update ──────────
export const PATCH = withApi<Ctx>(async (req: NextRequest, ctx?: Ctx) => {
  const admin = await requireAdmin();
  const id = await idFrom(ctx);
  if (!id) throw notFound("Order not found");

  const existing = await prisma.order.findUnique({
    where: { id },
    select: { id: true, orderNumber: true, status: true, confirmedAt: true, shippedAt: true, deliveredAt: true, cancelledAt: true },
  });
  if (!existing) throw notFound("Order not found");

  const body = parseBody(patchSchema, await req.json().catch(() => ({})));

  if (body.status === existing.status) {
    return jsonOk({ id, status: existing.status, changed: false });
  }

  const now = new Date();
  const data: Prisma.OrderUpdateInput = { status: body.status };
  if (body.status === "CONFIRMED" && !existing.confirmedAt) data.confirmedAt = now;
  if (
    (body.status === "SHIPPED" || body.status === "OUT_FOR_DELIVERY" || body.status === "DELIVERED") &&
    !existing.shippedAt
  ) {
    data.shippedAt = now;
  }
  if (body.status === "DELIVERED" && !existing.deliveredAt) data.deliveredAt = now;
  if (body.status === "CANCELLED" && !existing.cancelledAt) data.cancelledAt = now;

  await prisma.order.update({ where: { id }, data });

  await audit({
    adminId: admin.id,
    action: "ORDER_STATUS_UPDATE",
    entityType: "Order",
    entityId: id,
    details: {
      orderNumber: existing.orderNumber,
      from: existing.status,
      to: body.status,
    },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({ id, status: body.status, changed: true });
});

// ── DELETE /api/admin/orders/[id] — remove a FAILED order ──────────────
/**
 * Only FAILED orders may be deleted (anything else keeps its history).
 *
 * It is a SOFT delete: the row and everything hanging off it (OrderItem,
 * Payment, ApiSyncLog, mapping, coupon usage) stay in the database with
 * `deletedAt` set — every list/count query hides it, and Delete history can
 * bring it back. ORDER_DELETE is still written to the audit trail with the
 * full record of what happened.
 */
export const DELETE = withApi<Ctx>(async (req: NextRequest, ctx?: Ctx) => {
  const admin = await requireAdmin();
  const id = await idFrom(ctx);
  if (!id) throw notFound("Order not found");

  const existing = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      paymentMethod: true,
      total: true,
      customerName: true,
      customerPhone: true,
      customerEmail: true,
      externalOrderId: true,
      externalSyncStatus: true,
      placedAt: true,
      _count: { select: { items: true } },
    },
  });
  if (!existing) throw notFound("Order not found");

  if (existing.status !== "FAILED") {
    throw conflict(
      `Only failed orders can be deleted — ${existing.orderNumber} is ${existing.status.replace(/_/g, " ")} and its history must be kept.`
    );
  }

  const deletedAt = new Date();
  // Soft delete — row + items/payments/sync logs survive for Delete history.
  await prisma.order.update({ where: { id }, data: { deletedAt } });

  await audit({
    adminId: admin.id,
    action: "ORDER_DELETE",
    entityType: "Order",
    entityId: id,
    details: {
      orderNumber: existing.orderNumber,
      status: existing.status,
      paymentStatus: existing.paymentStatus,
      paymentMethod: existing.paymentMethod,
      total: Number(existing.total),
      items: existing._count.items,
      customerName: existing.customerName,
      customerPhone: existing.customerPhone,
      customerEmail: existing.customerEmail,
      externalOrderId: existing.externalOrderId,
      externalSyncStatus: existing.externalSyncStatus,
      placedAt: existing.placedAt.toISOString(),
      deletedAt: deletedAt.toISOString(),
      softDelete: true,
      restorable: true,
      deletedBy: admin.email,
    },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({ id, orderNumber: existing.orderNumber, deleted: true, restorable: true });
});
