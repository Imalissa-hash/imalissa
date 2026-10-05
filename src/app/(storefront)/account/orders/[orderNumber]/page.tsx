import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  CircleDashed,
  CreditCard,
  MapPin,
  Package,
  Phone,
} from "lucide-react";
import { PrintButton } from "@/components/ui/PrintButton";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatBDT, formatDate, cn } from "@/lib/utils";
import { ORDER_STATUS_FLOW, ORDER_STATUS_LABELS, statusStepIndex } from "@/lib/order";
import { AccountPanel } from "@/components/account/AccountShell";
import { OrderStatusBadge } from "@/components/ui/StatusBadge";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";

export const metadata: Metadata = {
  title: "Order Details",
  robots: { index: false },
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect(`/auth/login?next=/account/orders/${(await params).orderNumber}`);

  const { orderNumber } = await params;
  const order = await prisma.order.findFirst({
    where: { orderNumber: orderNumber.toUpperCase(), userId: user.id, deletedAt: null },
    include: {
      items: true,
      payments: { select: { method: true, amount: true, status: true, createdAt: true } },
    },
  });

  if (!order) notFound();

  const address = order.address as Record<string, string | null>;
  const cancelled = ["CANCELLED", "FAILED", "RETURNED"].includes(order.status);
  const currentStep = statusStepIndex(order.status);

  return (
    <div className="space-y-5">
      <Breadcrumbs
        items={[
          { label: "My Account", href: "/account" },
          { label: "Orders", href: "/account/orders" },
          { label: order.orderNumber },
        ]}
      />

      {/* Header */}
      <div className="rounded-2xl border border-gold-500/20 bg-gradient-to-r from-ink-800 to-ink-900 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-2xl font-bold text-mist-50">{order.orderNumber}</h1>
              <OrderStatusBadge status={order.status} />
            </div>
            <p className="mt-1 text-sm text-mist-400">
              Placed on {formatDate(order.placedAt)}
              {order.deliveredAt ? ` · Delivered ${formatDate(order.deliveredAt, "short")}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/track-order?orderNumber=${order.orderNumber}`}
              className="btn-outline-gold rounded-xl px-4 py-2.5 text-[0.82rem]"
            >
              Track
            </Link>
            <PrintButton />
          </div>
        </div>

        {/* Timeline */}
        {!cancelled ? (
          <ol className="mt-7 grid gap-3 sm:grid-cols-6">
            {ORDER_STATUS_FLOW.map((s, i) => {
              const done = currentStep >= i;
              const isCurrent = currentStep === i;
              return (
                <li key={s} className="flex flex-col items-center text-center">
                  <div
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full border transition",
                      done
                        ? "border-gold-500/60 bg-gold-500/[0.12] text-gold-300"
                        : "border-white/10 bg-white/[0.03] text-mist-600",
                      isCurrent && "ring-4 ring-gold-500/15"
                    )}
                  >
                    {done ? <CheckCircle2 size={17} /> : <CircleDashed size={17} />}
                  </div>
                  <p
                    className={cn(
                      "mt-2 text-[0.72rem] leading-tight",
                      done ? "text-mist-200" : "text-mist-600"
                    )}
                  >
                    {ORDER_STATUS_LABELS[s]}
                  </p>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="mt-6 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            This order was {ORDER_STATUS_LABELS[order.status]?.toLowerCase()}. Need help?{" "}
            <Link href="/contact" className="underline">
              Contact support
            </Link>
            .
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          {/* Items */}
          <AccountPanel title="Items" subtitle={`${order.items.length} product(s)`}>
            <div className="divide-y divide-white/[0.06]">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-white/[0.08] bg-ink-800">
                    {item.image &&
                      (item.image.endsWith(".svg") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.image} alt={item.productName} className="h-full w-full object-cover" />
                      ) : (
                        <Image src={item.image} alt={item.productName} fill sizes="64px" className="object-cover" />
                      ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    {item.productSlug ? (
                      <Link
                        href={`/product/${item.productSlug}`}
                        className="line-clamp-1 text-[0.92rem] font-medium text-mist-100 transition hover:text-gold-300"
                      >
                        {item.productName}
                      </Link>
                    ) : (
                      <p className="line-clamp-1 text-[0.92rem] font-medium text-mist-100">
                        {item.productName}
                      </p>
                    )}
                    <p className="text-[0.74rem] text-mist-600">
                      SKU: {item.sku}
                      {item.variantLabel ? ` · ${item.variantLabel}` : ""}
                    </p>
                    <p className="text-[0.76rem] text-mist-500">
                      {formatBDT(item.unitPrice)} × {item.quantity}
                    </p>
                  </div>
                  <p className="font-display text-lg font-semibold text-gold-300">
                    {formatBDT(item.lineTotal)}
                  </p>
                </div>
              ))}
            </div>
          </AccountPanel>

          {/* Delivery address */}
          <AccountPanel title="Delivery Address">
            <div className="flex gap-3 text-[0.88rem] text-mist-300">
              <MapPin size={17} className="mt-0.5 shrink-0 text-gold-500" />
              <div>
                <p className="font-semibold text-mist-100">{address?.fullName ?? order.customerName}</p>
                <p>{address?.fullAddress}</p>
                <p>
                  {address?.area ? `${address.area}, ` : ""}
                  {address?.district ?? ""} {address?.division ? `— ${address.division}` : ""}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-mist-400">
                  <Phone size={13} /> {order.customerPhone}
                </p>
                {address?.instructions && (
                  <p className="mt-2 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-[0.8rem] text-mist-400">
                    Note: {address.instructions}
                  </p>
                )}
              </div>
            </div>
          </AccountPanel>
        </div>

        {/* Summary */}
        <aside className="space-y-5 lg:sticky lg:top-36 lg:h-fit">
          <div className="rounded-2xl border border-gold-500/20 bg-gradient-to-b from-ink-800 to-ink-900 p-6">
            <h2 className="font-display text-xl font-semibold text-gold-gradient">Summary</h2>

            <div className="mt-5 space-y-3 text-[0.88rem]">
              <Row label="Subtotal" value={formatBDT(order.subtotal)} />
              {Number(order.discount) > 0 && (
                <Row
                  label={`Discount${order.couponCode ? ` (${order.couponCode})` : ""}`}
                  value={`-${formatBDT(order.discount)}`}
                  tone="success"
                />
              )}
              <Row label="Delivery charge" value={formatBDT(order.deliveryCharge)} />
              <div className="divider-gold" />
              <div className="flex items-end justify-between">
                <span className="font-semibold text-mist-200">Total</span>
                <span className="font-display text-2xl font-bold text-gold-gradient">
                  {formatBDT(order.total)}
                </span>
              </div>
            </div>

            <div className="mt-5 space-y-2 border-t border-white/[0.07] pt-4 text-[0.8rem] text-mist-400">
              <p className="flex items-center gap-2">
                <CreditCard size={14} className="text-gold-500" />
                Payment: <strong className="text-mist-200">{order.paymentMethod}</strong>
                <OrderStatusBadge status={order.paymentStatus} dot={false} />
              </p>
              <p className="flex items-center gap-2">
                <Package size={14} className="text-gold-500" />
                {order.trackingNumber ? (
                  order.trackingUrl ? (
                    <a
                      href={order.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gold-400 underline"
                    >
                      {order.trackingNumber}
                    </a>
                  ) : (
                    <span>{order.trackingNumber}</span>
                  )
                ) : (
                  <span className="text-mist-500">Tracking will appear once shipped</span>
                )}
              </p>
            </div>

            <Link
              href="/contact"
              className="mt-5 block text-center text-[0.82rem] text-mist-500 transition hover:text-gold-400"
            >
              Need help with this order? Contact us
            </Link>
          </div>

          <Link
            href="/account/orders"
            className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-[0.85rem] text-mist-300 transition hover:border-gold-500/40 hover:text-gold-300"
          >
            <ArrowLeft size={15} /> Back to orders
          </Link>
        </aside>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success";
}) {
  return (
    <div className="flex justify-between">
      <span className="text-mist-400">{label}</span>
      <span className={tone === "success" ? "text-success" : "text-mist-100"}>{value}</span>
    </div>
  );
}
