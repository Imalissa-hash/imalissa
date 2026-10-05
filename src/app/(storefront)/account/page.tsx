import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Clock,
  PackageCheck,
  Receipt,
  Heart,
  Truck,
} from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatBDT, formatDate } from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/lib/order";
import { AccountPanel } from "@/components/account/AccountShell";
import { OrderStatusBadge } from "@/components/ui/StatusBadge";

export const metadata: Metadata = {
  title: "My Account",
  robots: { index: false },
};

export default async function AccountOverviewPage() {
  const user = await getSessionUser();
  if (!user) redirect("/auth/login?next=/account");

  const [orders, wishlistCount, reviewCount, addressCount, profile] = await Promise.all([
    prisma.order.findMany({
      where: { userId: user.id, deletedAt: null },
      orderBy: { placedAt: "desc" },
      take: 5,
      select: {
        orderNumber: true,
        status: true,
        total: true,
        paymentMethod: true,
        placedAt: true,
        items: { select: { quantity: true } },
      },
    }),
    prisma.wishlist.count({ where: { userId: user.id } }),
    prisma.review.count({ where: { userId: user.id } }),
    prisma.address.count({ where: { userId: user.id } }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, phone: true },
    }),
  ]);

  const stats = await prisma.order.aggregate({
    where: { userId: user.id, status: { notIn: ["CANCELLED", "FAILED"] }, deletedAt: null },
    _sum: { total: true },
    _count: true,
  });

  const activeOrders = orders.filter((o) =>
    ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY"].includes(o.status)
  ).length;

  const tiles = [
    { label: "Total orders", value: String(stats._count), icon: Receipt },
    { label: "Total spent", value: formatBDT(stats._sum.total ?? 0), icon: PackageCheck },
    { label: "Active orders", value: String(activeOrders), icon: Truck },
    { label: "Wishlist", value: String(wishlistCount), icon: Heart },
  ];

  const profileComplete = Boolean(profile?.email && profile?.phone);

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="rounded-2xl border border-gold-500/20 bg-gradient-to-r from-ink-800 to-ink-900 p-6">
        <h1 className="font-display text-2xl font-bold text-mist-50">
          Hello, <span className="text-gold-gradient">{user.name.split(" ")[0]}</span>
        </h1>
        <p className="mt-1 text-sm text-mist-400">
          Manage your orders, saved addresses and preferences from one place.
        </p>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 transition hover:border-gold-500/25"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-gold-500/20 bg-gold-500/[0.07] text-gold-400">
              <t.icon size={16} />
            </div>
            <p className="mt-3 font-display text-xl font-bold text-mist-50">{t.value}</p>
            <p className="text-[0.76rem] text-mist-500">{t.label}</p>
          </div>
        ))}
      </div>

      {/* Recent orders */}
      <AccountPanel
        title="Recent Orders"
        subtitle="Your latest purchases and their status"
        action={
          <Link
            href="/account/orders"
            className="flex items-center gap-1.5 text-[0.82rem] text-gold-400 transition hover:text-gold-300"
          >
            View all <ArrowRight size={14} />
          </Link>
        }
      >
        {orders.length === 0 ? (
          <div className="py-10 text-center">
            <Clock size={26} className="mx-auto text-mist-600" />
            <p className="mt-3 text-sm text-mist-500">You haven&apos;t placed any orders yet.</p>
            <Link href="/search" className="btn-gold mt-4 inline-block rounded-xl px-6 py-2.5 text-sm">
              Start Shopping
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((o) => (
              <Link
                key={o.orderNumber}
                href={`/account/orders/${o.orderNumber}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-ink-900/60 px-4 py-3.5 transition hover:border-gold-500/30"
              >
                <div>
                  <p className="text-[0.9rem] font-semibold text-mist-100">{o.orderNumber}</p>
                  <p className="text-[0.76rem] text-mist-500">
                    {formatDate(o.placedAt, "short")} · {o.items.reduce((s, i) => s + i.quantity, 0)}{" "}
                    item(s)
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <OrderStatusBadge status={o.status} />
                  <span className="font-display text-lg font-semibold text-gold-300">
                    {formatBDT(o.total)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </AccountPanel>

      {/* Setup checklist */}
      {!profileComplete || addressCount === 0 || reviewCount === 0 ? (
        <AccountPanel title="Finish setting up" subtitle="A few quick steps for a smoother checkout">
          <div className="grid gap-3 sm:grid-cols-3">
            <ChecklistItem
              done={profileComplete}
              label="Complete your profile"
              href="/account/settings"
            />
            <ChecklistItem
              done={addressCount > 0}
              label="Save a delivery address"
              href="/account/addresses"
            />
            <ChecklistItem
              done={reviewCount > 0}
              label="Review a purchased product"
              href="/account/reviews"
            />
          </div>
        </AccountPanel>
      ) : null}
    </div>
  );
}

function ChecklistItem({ done, label, href }: { done: boolean; label: string; href: string }) {
  return (
    <Link
      href={href}
      className={`flex items-center justify-between rounded-xl border px-4 py-3 text-[0.85rem] transition ${
        done
          ? "border-success/25 bg-success/[0.07] text-success"
          : "border-white/[0.08] bg-white/[0.02] text-mist-300 hover:border-gold-500/30"
      }`}
    >
      {label}
      <ArrowRight size={14} className="opacity-60" />
    </Link>
  );
}
