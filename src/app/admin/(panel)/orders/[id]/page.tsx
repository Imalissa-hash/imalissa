import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { BackLink } from "@/components/admin/AdminShell";
import { OrderDetailClient } from "@/components/admin/sales/OrderDetailClient";
import type { OrderDetail } from "@/components/admin/sales/OrderDetailClient";

export const metadata: Metadata = {
  title: "Order details",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

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

/** Order detail page (params is a Promise in Next 15). */
export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const order = await prisma.order.findUnique({ where: { id }, include: fullInclude });
  if (!order) notFound();

  const address = (order.address ?? null) as Record<string, unknown> | null;

  const payload: OrderDetail = {
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

  return (
    <div>
      <BackLink href="/admin/orders" label="Back to orders" />
      <OrderDetailClient order={payload} />
    </div>
  );
}
