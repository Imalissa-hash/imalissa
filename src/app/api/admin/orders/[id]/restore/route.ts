import { NextRequest } from "next/server";
import { withApi, jsonOk, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { notFound, conflict } from "@/lib/errors";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/orders/[id]/restore — undo a delete.
 *
 * Clears `deletedAt`, so the order reappears in the Orders list, customer
 * history and reports with the exact status/items it had when removed.
 * The restore is recorded as ORDER_RESTORE in the audit trail.
 */
export const POST = withApi<Ctx>(async (req: NextRequest, ctx?: Ctx) => {
  const admin = await requireAdmin();
  const id = (await ctx?.params)?.id ?? "";
  if (!id) throw notFound("Order not found");

  const existing = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      total: true,
      deletedAt: true,
    },
  });
  if (!existing) throw notFound("Order not found");
  if (!existing.deletedAt) {
    throw conflict(`${existing.orderNumber} is not deleted — nothing to restore.`);
  }

  await prisma.order.update({ where: { id }, data: { deletedAt: null } });

  await audit({
    adminId: admin.id,
    action: "ORDER_RESTORE",
    entityType: "Order",
    entityId: id,
    details: {
      orderNumber: existing.orderNumber,
      status: existing.status,
      total: Number(existing.total),
      deletedAt: existing.deletedAt.toISOString(),
      restoredBy: admin.email,
    },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({ id, orderNumber: existing.orderNumber, restored: true });
});
