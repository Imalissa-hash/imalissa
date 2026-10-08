import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { BackLink } from "@/components/admin/AdminShell";
import { CustomerDetailClient } from "@/components/admin/sales/CustomerDetailClient";
import type { CustomerDetail } from "@/components/admin/sales/CustomerDetailClient";

import { pageGuard } from "@/components/admin/AccessDenied";
export const metadata: Metadata = {
  title: "Customer details",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Customer detail page (params is a Promise in Next 15). */
export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await pageGuard("customers.view");
  if (denied) return denied;

  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      status: true,
      createdAt: true,
      addresses: {
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        select: {
          id: true,
          type: true,
          fullName: true,
          phone: true,
          division: true,
          district: true,
          area: true,
          fullAddress: true,
          isDefault: true,
        },
      },
      _count: { select: { orders: { where: { deletedAt: null } }, reviews: true } },
    },
  });
  if (!user) notFound();

  const [spend, lastOrder, recentOrders] = await Promise.all([
    prisma.order.aggregate({
      where: { userId: id, status: { notIn: ["CANCELLED", "FAILED", "RETURNED"] }, deletedAt: null },
      _sum: { total: true },
    }),
    prisma.order.aggregate({ where: { userId: id, deletedAt: null }, _max: { placedAt: true } }),
    prisma.order.findMany({
      where: { userId: id, deletedAt: null },
      orderBy: { placedAt: "desc" },
      take: 10,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        total: true,
        placedAt: true,
      },
    }),
  ]);

  const payload: CustomerDetail = {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    addresses: user.addresses.map((a) => ({ ...a, type: a.type })),
    stats: {
      ordersCount: user._count.orders,
      reviewsCount: user._count.reviews,
      totalSpent: Number(spend._sum.total ?? 0),
      lastOrderAt: lastOrder._max.placedAt?.toISOString() ?? null,
    },
    recentOrders: recentOrders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      paymentStatus: o.paymentStatus,
      total: Number(o.total),
      placedAt: o.placedAt.toISOString(),
    })),
  };

  return (
    <div>
      <BackLink href="/admin/customers" label="Back to customers" />
      <CustomerDetailClient customer={payload} />
    </div>
  );
}
