import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PackageSearch, SlidersHorizontal } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { OrderStatus, Prisma } from "@prisma/client";
import { formatBDT, formatDate } from "@/lib/utils";
import { AccountPanel } from "@/components/account/AccountShell";
import { OrderStatusBadge } from "@/components/ui/StatusBadge";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = {
  title: "My Orders",
  robots: { index: false },
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "DELIVERED", label: "Delivered" },
  { key: "CANCELLED", label: "Cancelled" },
] as const;

const ACTIVE_STATUSES: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "OUT_FOR_DELIVERY",
];
const ALL_STATUSES: string[] = [
  ...ACTIVE_STATUSES,
  "DELIVERED",
  "CANCELLED",
  "RETURNED",
  "FAILED",
];
const PAGE_SIZE = 10;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/auth/login?next=/account/orders");

  const { status = "all", page: pageRaw } = await searchParams;
  const page = Math.max(1, Number(pageRaw) || 1);

  const where: Prisma.OrderWhereInput = { userId: user.id };
  if (status === "active") where.status = { in: ACTIVE_STATUSES };
  else if (status !== "all" && ALL_STATUSES.includes(status)) {
    where.status = status as OrderStatus;
  }
  // Soft-deleted orders are removed from the customer's history too.
  where.deletedAt = null;

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { placedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        orderNumber: true,
        status: true,
        paymentMethod: true,
        paymentStatus: true,
        total: true,
        placedAt: true,
        deliveredAt: true,
        externalSyncStatus: true,
        items: { select: { quantity: true, productName: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const qs = (s: string) => `/account/orders?status=${encodeURIComponent(s)}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-mist-50">My Orders</h1>
          <p className="text-sm text-mist-500">{total} order(s) on file</p>
        </div>
        <Link
          href="/track-order"
          className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-[0.84rem] text-mist-300 transition hover:border-gold-500/40 hover:text-gold-300"
        >
          <SlidersHorizontal size={14} /> Track a guest order
        </Link>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = status === f.key;
          return (
            <Link
              key={f.key}
              href={qs(f.key)}
              className={`rounded-full border px-4 py-1.5 text-[0.8rem] transition ${
                active
                  ? "border-gold-500/50 bg-gold-500/[0.12] text-gold-300"
                  : "border-white/10 text-mist-400 hover:border-gold-500/30 hover:text-mist-200"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      <AccountPanel title="Order history" subtitle="Click an order to see its full timeline">
        {orders.length === 0 ? (
          <EmptyState
            title="No orders here"
            description="When you place orders they will show up in this list."
            actionLabel="Browse products"
            actionHref="/search"
            icon={<PackageSearch size={26} />}
          />
        ) : (
          <div className="space-y-3">
            {orders.map((o) => (
              <Link
                key={o.orderNumber}
                href={`/account/orders/${o.orderNumber}`}
                className="block rounded-xl border border-white/[0.07] bg-ink-900/60 p-4 transition hover:border-gold-500/30 hover:bg-ink-900"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-mist-100">{o.orderNumber}</p>
                    <p className="text-[0.76rem] text-mist-500">
                      {formatDate(o.placedAt, "short")} ·{" "}
                      {o.items.reduce((s, i) => s + i.quantity, 0)} item(s) ·{" "}
                      {o.items[0]?.productName}
                      {o.items.length > 1 ? ` +${o.items.length - 1} more` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <OrderStatusBadge status={o.status} />
                    <span className="font-display text-lg font-semibold text-gold-300">
                      {formatBDT(o.total)}
                    </span>
                  </div>
                </div>
                {o.status === "DELIVERED" && o.deliveredAt && (
                  <p className="mt-2 text-[0.74rem] text-success">
                    Delivered on {formatDate(o.deliveredAt, "short")}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </AccountPanel>

      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          basePath="/account/orders"
          searchParams={{ status }}
        />
      )}
    </div>
  );
}
