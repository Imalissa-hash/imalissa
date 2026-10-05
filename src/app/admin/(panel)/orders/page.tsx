import type { Metadata } from "next";
import type { OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { OrdersClient } from "@/components/admin/sales/OrdersClient";
import type { OrderRow } from "@/components/admin/sales/OrdersClient";

export const metadata: Metadata = {
  title: "Orders",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

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
];
const PAYMENT_STATUSES = ["UNPAID", "PENDING", "PAID", "PARTIALLY_PAID", "REFUNDED", "FAILED"];

/** Admin order list — server-rendered from searchParams (same filters as the API). */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v : "";
  };

  const q = one("q").trim();
  const status = ORDER_STATUSES.includes(one("status")) ? one("status") : "";
  const payment = PAYMENT_STATUSES.includes(one("payment")) ? one("payment") : "";
  const requestedPage = Math.max(1, Number(one("page")) || 1);

  const where: Prisma.OrderWhereInput = {};
  if (q) {
    where.OR = [
      { orderNumber: { contains: q } },
      { customerName: { contains: q } },
      { customerPhone: { contains: q } },
      { customerEmail: { contains: q } },
    ];
  }
  if (status) where.status = status as OrderStatus;
  if (payment) where.paymentStatus = payment as PaymentStatus;
  // Soft-deleted orders live in the Delete history view only.
  where.deletedAt = null;

  const [rows, total, deletedCount] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { placedAt: "desc" },
      skip: (requestedPage - 1) * PAGE_SIZE,
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
        _count: { select: { items: true } },
      },
    }),
    prisma.order.count({ where }),
    prisma.order.count({ where: { deletedAt: { not: null } } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

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
  }));

  return (
    <div>
      <AdminPageHeader
        title="Orders"
        subtitle={`${total.toLocaleString()} order${total === 1 ? "" : "s"} in this view`}
      />
      <OrdersClient
        items={items}
        total={total}
        totalPages={totalPages}
        page={page}
        searchParams={sp}
        deletedCount={deletedCount}
      />
    </div>
  );
}
