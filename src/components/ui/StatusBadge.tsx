import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Status pill shared by storefront & admin.
 * Accepts any of: order status, payment status, sync status, review status.
 */
const STYLES: Record<string, string> = {
  // Order (in progress)
  PENDING: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  CONFIRMED: "border-sky-500/30 bg-sky-500/10 text-sky-400",
  PROCESSING: "border-indigo-500/30 bg-indigo-500/10 text-indigo-400",
  SHIPPED: "border-violet-500/30 bg-violet-500/10 text-violet-400",
  OUT_FOR_DELIVERY: "border-cyan-500/30 bg-cyan-500/10 text-cyan-400",
  DELIVERED: "border-success/30 bg-success/10 text-success",
  // Order (terminal / bad)
  CANCELLED: "border-danger/30 bg-danger/10 text-danger",
  RETURNED: "border-orange-500/30 bg-orange-500/10 text-orange-400",
  FAILED: "border-danger/30 bg-danger/10 text-danger",
  // Payment
  PAID: "border-success/30 bg-success/10 text-success",
  UNPAID: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  REFUNDED: "border-sky-500/30 bg-sky-500/10 text-sky-400",
  PARTIALLY_REFUNDED: "border-sky-500/30 bg-sky-500/10 text-sky-400",
  // External sync
  SYNCED: "border-success/30 bg-success/10 text-success",
  SYNCING: "border-sky-500/30 bg-sky-500/10 text-sky-400",
  SYNC_TIMEOUT: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  NOT_CONFIGURED: "border-white/15 bg-white/[0.05] text-mist-400",
  // Reviews / misc
  APPROVED: "border-success/30 bg-success/10 text-success",
  REJECTED: "border-danger/30 bg-danger/10 text-danger",
  ACTIVE: "border-success/30 bg-success/10 text-success",
  EXPIRED: "border-white/15 bg-white/[0.05] text-mist-400",
  SCHEDULED: "border-sky-500/30 bg-sky-500/10 text-sky-400",
  LOW: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  OUT: "border-danger/30 bg-danger/10 text-danger",
};

export const STATUS_LABELS: Record<string, string> = {
  OUT_FOR_DELIVERY: "Out for Delivery",
  NOT_CONFIGURED: "Not configured",
  SYNC_TIMEOUT: "Sync timeout",
  PARTIALLY_REFUNDED: "Partially refunded",
};

export function statusLabel(status: string): string {
  return (
    STATUS_LABELS[status] ??
    status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ")
  );
}

export function StatusBadge({
  status,
  className,
  dot = true,
}: {
  status: string;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-wide",
        STYLES[status] ?? "border-white/15 bg-white/[0.05] text-mist-300",
        className
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />}
      {statusLabel(status)}
    </span>
  );
}

/** Alias so imports read naturally on storefront pages. */
export function OrderStatusBadge({ status, dot }: { status: string; dot?: boolean }) {
  return <StatusBadge status={status} dot={dot} />;
}

/** Non-link version used inside tables. */
export function Badge({ status }: { status: string }) {
  return <StatusBadge status={status} />;
}

/** Linking badge for order rows. */
export function OrderLink({ orderNumber }: { orderNumber: string }) {
  return (
    <Link
      href={`/account/orders/${orderNumber}`}
      className="font-semibold text-gold-400 transition hover:text-gold-300"
    >
      {orderNumber}
    </Link>
  );
}
