import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  PackageCheck,
  RefreshCcw,
  ShoppingBag,
  TrendingUp,
  Users,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { formatBDT, formatDate, timeAgo } from "@/lib/utils";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { Panel, StatCard, Table, Th, Td, Empty } from "@/components/admin/ui";
import { BarChart, Donut, LineChart } from "@/components/admin/Charts";
import { StatusBadge } from "@/components/ui/StatusBadge";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

interface RevenueRow {
  day: Date | string;
  orders: number | bigint;
  revenue: string | number;
}

/** Admin dashboard: KPIs, 14-day revenue trend, status mix, queues. */
export default async function AdminDashboardPage() {
  const since14 = new Date();
  since14.setDate(since14.getDate() - 13);
  since14.setHours(0, 0, 0, 0);

  const [
    revenueRows,
    totalRevenueAgg,
    totalOrders,
    customerCount,
    activeProducts,
    pendingOrders,
    ordersByStatus,
    syncByStatus,
    lowStockCount,
    topProducts,
    recentOrders,
    lowStockProducts,
  ] = await Promise.all([
    prisma.$queryRaw<RevenueRow[]>`
      SELECT DATE(placedAt) AS day, COUNT(*) AS orders, COALESCE(SUM(total), 0) AS revenue
      FROM \`Order\`
      WHERE placedAt >= ${since14}
        AND deletedAt IS NULL
        AND status NOT IN ('CANCELLED', 'FAILED')
      GROUP BY DATE(placedAt)
      ORDER BY day
    `,
    prisma.order.aggregate({
      where: { status: { notIn: ["CANCELLED", "FAILED"] }, deletedAt: null },
      _sum: { total: true },
      _count: true,
    }),
    prisma.order.count({ where: { deletedAt: null } }),
    prisma.user.count(),
    prisma.product.count({ where: { status: "ACTIVE" } }),
    prisma.order.count({
      where: { status: { in: ["PENDING", "CONFIRMED", "PROCESSING"] }, deletedAt: null },
    }),
    prisma.order.groupBy({ by: ["status"], where: { deletedAt: null }, _count: true }),
    prisma.order.groupBy({ by: ["externalSyncStatus"], where: { deletedAt: null }, _count: true }),
    prisma.$queryRaw<{ c: number | bigint }[]>`
      SELECT COUNT(*) AS c FROM \`Product\`
      WHERE status = 'ACTIVE' AND stock <= lowStockThreshold
    `,
    prisma.orderItem.groupBy({
      by: ["productName"],
      where: { order: { deletedAt: null } },
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { lineTotal: "desc" } },
      take: 6,
    }),
    prisma.order.findMany({
      where: { deletedAt: null },
      orderBy: { placedAt: "desc" },
      take: 7,
      select: {
        orderNumber: true,
        customerName: true,
        status: true,
        paymentMethod: true,
        total: true,
        placedAt: true,
        externalSyncStatus: true,
      },
    }),
    prisma.product.findMany({
      where: { status: "ACTIVE", stock: { lte: 5 } },
      orderBy: { stock: "asc" },
      take: 6,
      select: { name: true, slug: true, stock: true, lowStockThreshold: true },
    }),
  ]);

  // ── 14-day series (fill gaps) ────────────────────────────────
  const byDay = new Map<string, { orders: number; revenue: number }>();
  for (const row of revenueRows) {
    const d = row.day instanceof Date ? row.day : new Date(String(row.day));
    const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    byDay.set(key, { orders: Number(row.orders), revenue: Number(row.revenue) });
  }
  const series: { label: string; value: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    const hit = byDay.get(key);
    series.push({
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: hit?.revenue ?? 0,
    });
  }
  const revenue14 = series.reduce((s, p) => s + p.value, 0);
  const prev7 = series.slice(0, 7).reduce((s, p) => s + p.value, 0);
  const last7 = series.slice(7).reduce((s, p) => s + p.value, 0);
  const trendPct = prev7 > 0 ? Math.round(((last7 - prev7) / prev7) * 100) : null;

  const totalRevenue = Number(totalRevenueAgg._sum.total ?? 0);
  const avgOrder = totalRevenueAgg._count > 0 ? totalRevenue / totalRevenueAgg._count : 0;

  const statusLabels: Record<string, string> = {
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
  const donutData = ordersByStatus.map((s) => ({
    label: statusLabels[s.status] ?? s.status,
    value: s._count,
  }));

  const syncMap = new Map(syncByStatus.map((s) => [s.externalSyncStatus, s._count]));
  const syncFailed = (syncMap.get("FAILED") ?? 0) + (syncMap.get("SYNC_TIMEOUT") ?? 0);
  const syncSynced = syncMap.get("SYNCED") ?? 0;
  const syncPending = (syncMap.get("PENDING") ?? 0) + (syncMap.get("SYNCING") ?? 0);

  const kpis = [
    {
      label: "Total revenue",
      value: formatBDT(totalRevenue),
      hint:
        trendPct !== null
          ? `${trendPct >= 0 ? "▲" : "▼"} ${Math.abs(trendPct)}% vs previous 7 days`
          : "7-day trend unavailable",
      icon: <TrendingUp size={18} />,
      tone: "gold" as const,
    },
    {
      label: "Orders",
      value: totalOrders.toLocaleString(),
      hint: `${pendingOrders} awaiting processing`,
      icon: <ShoppingBag size={18} />,
      tone: "muted" as const,
    },
    {
      label: "Customers",
      value: customerCount.toLocaleString(),
      hint: `${activeProducts} active products`,
      icon: <Users size={18} />,
      tone: "muted" as const,
    },
    {
      label: "Avg order value",
      value: formatBDT(Math.round(avgOrder)),
      hint: `${Number(lowStockCount[0]?.c ?? 0)} low-stock items`,
      icon: <PackageCheck size={18} />,
      tone: Number(lowStockCount[0]?.c ?? 0) > 0 ? ("danger" as const) : ("success" as const),
    },
  ];

  return (
    <div>
      <AdminPageHeader
        title="Dashboard"
        subtitle={new Date().toLocaleDateString("en-US", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
        action={
          <Link
            href="/admin/orders"
            className="btn-gold flex items-center gap-2 rounded-xl px-4 py-2.5 text-[0.84rem]"
          >
            Process orders <ArrowRight size={15} />
          </Link>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {kpis.map((k) => (
          <StatCard key={k.label} {...k} />
        ))}
      </div>

      {/* Charts */}
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.7fr_1fr]">
        <Panel title="Revenue — last 14 days" subtitle="Delivered/paid-trackable orders only">
          <LineChart data={series} />
          <p className="mt-2 text-[0.76rem] text-mist-600">
            14-day revenue: <strong className="text-gold-300">{formatBDT(revenue14)}</strong>
          </p>
        </Panel>

        <Panel title="Orders by status">
          <Donut data={donutData} centerValue={String(totalOrders)} centerLabel="orders" />
        </Panel>
      </div>

      {/* Queues */}
      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Panel
          title="External API sync"
          subtitle="Order forwarding health"
          action={
            <Link
              href="/admin/sync"
              className="text-[0.8rem] text-gold-400 transition hover:text-gold-300"
            >
              Open Sync Center →
            </Link>
          }
        >
          <div className="space-y-3">
            <SyncRow icon={<RefreshCcw size={14} />} label="Synced" value={syncSynced} tone="success" />
            <SyncRow icon={<Clock size={14} />} label="Pending / in-flight" value={syncPending} tone="muted" />
            <SyncRow
              icon={<AlertTriangle size={14} />}
              label="Failed / needs review"
              value={syncFailed}
              tone={syncFailed > 0 ? "danger" : "muted"}
            />
          </div>
          <p className="mt-4 border-t border-white/[0.07] pt-3 text-[0.74rem] leading-relaxed text-mist-600">
            Ambiguous results (timeouts / 5xx) are never marked as synced — they wait for
            verification before any retry.
          </p>
        </Panel>

        <Panel
          title="Low stock"
          action={
            <Link
              href="/admin/inventory"
              className="text-[0.8rem] text-gold-400 transition hover:text-gold-300"
            >
              Inventory →
            </Link>
          }
        >
          {lowStockProducts.length === 0 ? (
            <Empty title="All stocked up" hint="No product is at or below its threshold." />
          ) : (
            <ul className="space-y-2.5">
              {lowStockProducts.map((p) => (
                <li
                  key={p.slug}
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2"
                >
                  <Link
                    href={`/admin/products?search=${encodeURIComponent(p.name)}`}
                    className="line-clamp-1 text-[0.84rem] text-mist-200 hover:text-gold-300"
                  >
                    {p.name}
                  </Link>
                  <span
                    className={`shrink-0 rounded-md px-2 py-0.5 text-[0.72rem] font-bold ${
                      p.stock === 0
                        ? "bg-danger/15 text-danger"
                        : "bg-amber-500/15 text-amber-400"
                    }`}
                  >
                    {p.stock} left
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Top products"
          subtitle="By revenue"
          action={
            <Link
              href="/admin/analytics"
              className="text-[0.8rem] text-gold-400 transition hover:text-gold-300"
            >
              Analytics →
            </Link>
          }
        >
          <BarChart
            horizontal
            data={topProducts.map((p) => ({
              label: p.productName,
              value: Number(p._sum.lineTotal ?? 0),
            }))}
          />
        </Panel>
      </div>

      {/* Recent orders */}
      <Panel
        className="mt-5"
        title="Recent orders"
        action={
          <Link
            href="/admin/orders"
            className="flex items-center gap-1 text-[0.8rem] text-gold-400 transition hover:text-gold-300"
          >
            View all <ArrowRight size={13} />
          </Link>
        }
      >
        {recentOrders.length === 0 ? (
          <Empty title="No orders yet" hint="New orders will appear here in real time." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Customer</Th>
                <Th>Status</Th>
                <Th>API sync</Th>
                <Th>Placed</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((o) => (
                <tr key={o.orderNumber} className="transition hover:bg-white/[0.02]">
                  <Td>
                    <Link
                      href={`/admin/orders/${o.orderNumber}`}
                      className="font-semibold text-gold-400 hover:text-gold-300"
                    >
                      {o.orderNumber}
                    </Link>
                  </Td>
                  <Td className="text-mist-200">{o.customerName}</Td>
                  <Td>
                    <StatusBadge status={o.status} />
                  </Td>
                  <Td>
                    <StatusBadge status={o.externalSyncStatus} dot={false} />
                  </Td>
                  <Td className="whitespace-nowrap text-mist-500">
                    {timeAgo(o.placedAt)} · {formatDate(o.placedAt, "time")}
                  </Td>
                  <Td className="text-right font-display font-semibold text-gold-300">
                    {formatBDT(o.total)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </div>
  );
}

function SyncRow({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "success" | "danger" | "muted";
}) {
  const tones = {
    success: "border-success/25 bg-success/[0.07] text-success",
    danger: "border-danger/25 bg-danger/[0.07] text-danger",
    muted: "border-white/10 bg-white/[0.03] text-mist-400",
  };
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5">
      <span className="flex items-center gap-2 text-[0.84rem] text-mist-400">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg border ${tones[tone]}`}>
          {icon}
        </span>
        {label}
      </span>
      <span className="font-display text-lg font-bold text-mist-100">{value}</span>
    </div>
  );
}
