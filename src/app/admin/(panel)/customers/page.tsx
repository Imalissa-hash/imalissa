import type { Metadata } from "next";
import type { Prisma, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { CustomersClient } from "@/components/admin/sales/CustomersClient";
import type { CustomerRow } from "@/components/admin/sales/CustomersClient";

export const metadata: Metadata = {
  title: "Customers",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const STATUSES = ["ACTIVE", "BLOCKED"];

/** Admin customer list — server-rendered from searchParams. */
export default async function AdminCustomersPage({
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
  const status = STATUSES.includes(one("status")) ? one("status") : "";
  const requestedPage = Math.max(1, Number(one("page")) || 1);

  const where: Prisma.UserWhereInput = {};
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { email: { contains: q } },
      { phone: { contains: q } },
    ];
  }
  if (status) where.status = status as UserStatus;

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (requestedPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
        _count: { select: { orders: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  const ids = rows.map((r) => r.id);
  const spendGroups = ids.length
    ? await prisma.order.groupBy({
        by: ["userId"],
        where: { userId: { in: ids }, status: { notIn: ["CANCELLED", "FAILED", "RETURNED"] }, deletedAt: null },
        _sum: { total: true },
      })
    : [];
  const spendByUser = new Map(spendGroups.map((g) => [g.userId, Number(g._sum.total ?? 0)]));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const items: CustomerRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    status: r.status,
    ordersCount: r._count.orders,
    totalSpent: spendByUser.get(r.id) ?? 0,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <div>
      <AdminPageHeader
        title="Customers"
        subtitle={`${total.toLocaleString()} customer${total === 1 ? "" : "s"} in this view`}
      />
      <CustomersClient
        items={items}
        total={total}
        totalPages={totalPages}
        page={page}
        searchParams={sp}
      />
    </div>
  );
}
