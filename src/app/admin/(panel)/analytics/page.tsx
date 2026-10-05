import type { Metadata } from "next";
import {
  AlertTriangle,
  Inbox,
  Package,
  ShoppingBag,
  Star,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { formatBDT } from "@/lib/utils";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { Panel, StatCard, Table, Th, Td, Empty } from "@/components/admin/ui";
import { BarChart, Donut, LineChart, type SeriesPoint } from "@/components/admin/Charts";
import { AnalyticsClient } from "@/components/admin/system/AnalyticsClient";

export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Analytics — range-driven (?range=7|30|90, default 30) KPIs and charts.
 * Honest metrics only: revenue excludes CANCELLED/FAILED orders (stated
 * in every relevant hint), and no conversion rates are invented.
 */

const EXCLUDED_STATUSES = ["CANCELLED", "FAILED"] as const;

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  RETURNED: "Returned",
  FAILED: "Failed",
};

const PAYMENT_LABELS: Record<string, string> = {
  COD: "Cash on Delivery",
  BKASH: "bKash",
  NAGAD: "Nagad",
  CARD: "Card",
  OTHER: "Other",
};

interface RevenueRow {
  day: Date | string;
  orders: number | bigint;
  revenue: string | number;
}

interface Props {
  searchParams: Promise<{ range?: string }>;
}

/** Stable local-day key for a DATE(placedAt) result (Date or "YYYY-MM-DD"). */
function dayKey(d: Date | string): string {
  if (typeof d === "string") {
    const [y, m, day] = d.slice(0, 10).split("-");
    return `${y}-${m}-${day}`;
  }
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function localKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export default async function AnalyticsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const range = sp.range === "7" || sp.range === "90" ? Number(sp.range) : 30;

  const since = new Date();
  since.setDate(since.getDate() - (range - 1));
  since.setHours(0, 0, 0, 0);

  const [
    revenueRows,
    revenueAgg, // non-cancelled/non-failed orders in range
    ordersInRange,
    newCustomers,
    unitsAgg,
    byStatus,
    categoryItems,
    topProductRows,
    byPayment,
    couponAgg,
    totalProducts,
    outOfStock,
    pendingReviews,
    unreadMessages,
  ] = await Promise.all([
    prisma.$queryRaw<RevenueRow[]>`
      SELECT DATE(placedAt) AS day, COUNT(*) AS orders, COALESCE(SUM(total), 0) AS revenue
      FROM \`Order\`
      WHERE placedAt >= ${since}
        AND deletedAt IS NULL
        AND status NOT IN ('CANCELLED', 'FAILED')
      GROUP BY DATE(placedAt)
      ORDER BY day
    `,
    prisma.order.aggregate({
      where: { placedAt: { gte: since }, status: { notIn: [...EXCLUDED_STATUSES] }, deletedAt: null },
      _sum: { total: true },
      _count: true,
    }),
    prisma.order.count({ where: { placedAt: { gte: since }, deletedAt: null } }),
    prisma.user.count({ where: { createdAt: { gte: since } } }),
    prisma.orderItem.aggregate({
      where: { order: { placedAt: { gte: since }, status: { notIn: [...EXCLUDED_STATUSES] }, deletedAt: null } },
      _sum: { quantity: true },
    }),
    prisma.order.groupBy({
      by: ["status"],
      where: { placedAt: { gte: since }, deletedAt: null },
      _count: true,
    }),
    prisma.orderItem.findMany({
      where: { order: { placedAt: { gte: since }, status: { notIn: [...EXCLUDED_STATUSES] }, deletedAt: null } },
      select: {
        quantity: true,
        lineTotal: true,
        product: { select: { category: { select: { name: true } } } },
      },
    }),
    prisma.orderItem.groupBy({
      by: ["productName"],
      where: { order: { placedAt: { gte: since }, status: { notIn: [...EXCLUDED_STATUSES] }, deletedAt: null } },
      _sum: { lineTotal: true, quantity: true },
      orderBy: { _sum: { lineTotal: "desc" } },
      take: 5,
    }),
    prisma.order.groupBy({
      by: ["paymentMethod"],
      where: { placedAt: { gte: since }, deletedAt: null },
      _count: true,
    }),
    prisma.couponUsage.groupBy({
      by: ["couponId"],
      where: { createdAt: { gte: since } },
      _count: true,
      _sum: { amount: true },
    }),
    prisma.product.count(),
    prisma.product.count({ where: { status: "ACTIVE", stock: { lte: 0 } } }),
    prisma.review.count({ where: { status: "PENDING" } }),
    prisma.contactMessage.count({ where: { isRead: false } }),
  ]);

  /* ── KPIs ───────────────────────────────────────────────────────── */

  const revenue = Number(revenueAgg._sum.total ?? 0);
  const nonCancelledCount = revenueAgg._count;
  const aov = nonCancelledCount > 0 ? revenue / nonCancelledCount : 0;
  const unitsSold = Number(unitsAgg._sum.quantity ?? 0);

  /* ── Revenue per day (fill zero days) ───────────────────────────── */

  const byDay = new Map<string, number>();
  for (const row of revenueRows) {
    byDay.set(dayKey(row.day), Number(row.revenue));
  }
  const revenueSeries: SeriesPoint[] = [];
  for (let i = range - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    revenueSeries.push({
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: byDay.get(localKey(d)) ?? 0,
    });
  }

  /* ── Status donut (all orders in range) ─────────────────────────── */

  const statusSeries: SeriesPoint[] = byStatus.map((s) => ({
    label: STATUS_LABELS[s.status] ?? s.status,
    value: s._count,
  }));

  /* ── Revenue by category (items → product → category, aggregate in JS) ── */

  const catMap = new Map<string, number>();
  for (const item of categoryItems) {
    const name = item.product?.category?.name ?? "Uncategorised";
    catMap.set(name, (catMap.get(name) ?? 0) + Number(item.lineTotal));
  }
  const categorySeries: SeriesPoint[] = [...catMap.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  /* ── Top products / payment mix ─────────────────────────────────── */

  const topProductSeries: SeriesPoint[] = topProductRows.map((p) => ({
    label: p.productName,
    value: Number(p._sum.lineTotal ?? 0),
  }));

  const paymentSeries: SeriesPoint[] = byPayment.map((p) => ({
    label: PAYMENT_LABELS[p.paymentMethod] ?? p.paymentMethod,
    value: p._count,
  }));

  /* ── Coupons used in range ──────────────────────────────────────── */

  const couponIds = couponAgg.map((c) => c.couponId);
  const coupons = await prisma.coupon.findMany({
    where: { id: { in: couponIds } },
    select: { id: true, code: true, type: true, value: true },
  });
  const couponMap = new Map(coupons.map((c) => [c.id, c]));
  const couponRows = couponAgg
    .map((c) => {
      const cp = couponMap.get(c.couponId);
      return {
        id: c.couponId,
        code: cp?.code ?? "(deleted coupon)",
        type: cp?.type ?? null,
        value: cp ? Number(cp.value) : 0,
        uses: c._count,
        discount: Number(c._sum.amount ?? 0),
      };
    })
    .sort((a, b) => b.discount - a.discount);

  return (
    <div>
      <AdminPageHeader
        title="Analytics"
        subtitle={`Store performance over the last ${range} days`}
        action={<AnalyticsClient range={range} />}
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Revenue" value={formatBDT(revenue)} hint="Excludes cancelled & failed" icon={<TrendingUp size={18} />} tone="gold" />
        <StatCard label="Orders" value={ordersInRange.toLocaleString()} hint="All orders placed in range" icon={<ShoppingBag size={18} />} tone="muted" />
        <StatCard label="Avg order value" value={formatBDT(Math.round(aov))} hint="Revenue ÷ non-cancelled orders" icon={<Wallet size={18} />} tone="muted" />
        <StatCard label="New customers" value={newCustomers.toLocaleString()} hint="Registered accounts in range" icon={<Users size={18} />} tone="muted" />
        <StatCard label="Units sold" value={unitsSold.toLocaleString()} hint="Items in non-cancelled orders" icon={<Package size={18} />} tone="muted" />
      </div>

      {/* Revenue + status */}
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.7fr_1fr]">
        <Panel title="Revenue per day" subtitle={`Cancelled and failed orders excluded`}>
          <LineChart data={revenueSeries} />
          <p className="mt-2 text-[0.76rem] text-mist-600">
            {range}-day revenue: <strong className="text-gold-300">{formatBDT(revenue)}</strong> from{" "}
            {nonCancelledCount.toLocaleString()} non-cancelled orders
          </p>
        </Panel>
        <Panel title="Orders by status" subtitle="All orders placed in range">
          <Donut data={statusSeries} centerValue={String(ordersInRange)} centerLabel="orders" />
        </Panel>
      </div>

      {/* Category + products */}
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel title="Revenue by category" subtitle="Top categories in range">
          <BarChart data={categorySeries} />
        </Panel>
        <Panel title="Top 5 products by revenue" subtitle="Non-cancelled orders in range">
          <BarChart horizontal data={topProductSeries} />
        </Panel>
      </div>

      {/* Payment mix + coupons */}
      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1.4fr]">
        <Panel title="Payment method mix" subtitle="Orders placed in range (all statuses)">
          <Donut data={paymentSeries} centerValue={String(ordersInRange)} centerLabel="orders" />
        </Panel>

        <Panel title="Coupons used" subtitle={`Redemptions in the last ${range} days`}>
          {couponRows.length === 0 ? (
            <Empty title="No coupon redemptions yet" hint="Redeemed coupons appear here with usage and discount totals." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Coupon</Th>
                  <Th>Discount</Th>
                  <Th className="text-right">Uses</Th>
                  <Th className="text-right">Discount given</Th>
                </tr>
              </thead>
              <tbody>
                {couponRows.map((c) => (
                  <tr key={c.id} className="transition hover:bg-white/[0.02]">
                    <Td className="font-semibold text-gold-300">{c.code}</Td>
                    <Td>
                      {c.type === "PERCENTAGE"
                        ? `${c.value}%`
                        : c.type === "FIXED"
                          ? formatBDT(c.value)
                          : "—"}
                    </Td>
                    <Td className="text-right">{c.uses.toLocaleString()}</Td>
                    <Td className="text-right font-display font-semibold text-mist-100">
                      {formatBDT(c.discount)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
      </div>

      {/* Search & discovery */}
      <Panel
        className="mt-5"
        title="Search & discovery"
        subtitle="Catalog and inbox health — what shoppers actually run into"
      >
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatCard
            label="Total products"
            value={totalProducts.toLocaleString()}
            hint="All statuses, including drafts"
            icon={<Package size={18} />}
            tone="muted"
          />
          <StatCard
            label="Out of stock"
            value={outOfStock.toLocaleString()}
            hint="Active products with 0 stock"
            icon={<AlertTriangle size={18} />}
            tone={outOfStock > 0 ? "danger" : "success"}
          />
          <StatCard
            label="Pending reviews"
            value={pendingReviews.toLocaleString()}
            hint="Waiting for moderation"
            icon={<Star size={18} />}
            tone={pendingReviews > 0 ? "gold" : "muted"}
          />
          <StatCard
            label="Unread messages"
            value={unreadMessages.toLocaleString()}
            hint="Contact form inbox"
            icon={<Inbox size={18} />}
            tone={unreadMessages > 0 ? "gold" : "muted"}
          />
        </div>
      </Panel>
    </div>
  );
}
