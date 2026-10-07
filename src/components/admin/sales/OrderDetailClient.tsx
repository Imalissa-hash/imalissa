"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  MapPin,
  RefreshCcw,
  User,
} from "lucide-react";
import {
  Panel,
  Table,
  Th,
  Td,
  Btn,
  BusyBtn,
  Select,
  ConfirmDialog,
} from "@/components/admin/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn, formatBDT, formatDate, timeAgo } from "@/lib/utils";

/* ── Server-serialized shapes ───────────────────────────── */

export interface OrderItemLine {
  id: string;
  productName: string;
  sku: string;
  variantLabel: string | null;
  image: string | null;
  unitPrice: number;
  lineDiscount: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderPaymentLine {
  id: string;
  method: string;
  amount: number;
  status: string;
  transactionId: string | null;
  createdAt: string;
}

export interface OrderSyncLogRow {
  id: string;
  direction: string;
  status: string;
  attempt: number;
  error: string | null;
  durationMs: number | null;
  createdAt: string;
}

export interface OrderCustomerRef {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
}

export interface OrderAddress {
  fullName?: string;
  phone?: string;
  division?: string;
  district?: string;
  area?: string;
  fullAddress?: string;
  instructions?: string;
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  userId: string | null;
  user: OrderCustomerRef | null;
  guestEmail: string | null;
  guestPhone: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  subtotal: number;
  discount: number;
  couponCode: string | null;
  deliveryCharge: number;
  total: number;
  address: OrderAddress | null;
  instructions: string | null;
  customerNote: string | null;
  adminNotes: string | null;
  externalOrderId: string | null;
  externalSyncStatus: string;
  syncAttempts: number;
  syncStartedAt: string | null;
  syncedAt: string | null;
  lastSyncError: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  placedAt: string;
  confirmedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  updatedAt: string;
  items: OrderItemLine[];
  payments: OrderPaymentLine[];
  syncLogs: OrderSyncLogRow[];
}

/* ── Status vocabulary ──────────────────────────────────── */

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
] as const;

const FLOW = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"];
const TERMINAL = ["CANCELLED", "RETURNED", "FAILED"];

type SyncAction = "retry" | "verify" | "markSynced" | "releaseRetry" | "pullStatus";

interface Notice {
  tone: "ok" | "err" | "info";
  text: string;
}

/* ── Inline notice (same pattern as catalog clients) ───── */
function NoticeBar({ notice, onDismiss }: { notice: Notice | null; onDismiss: () => void }) {
  if (!notice) return null;
  const tone =
    notice.tone === "ok"
      ? "border-success/30 bg-success/10 text-success"
      : notice.tone === "err"
        ? "border-danger/30 bg-danger/10 text-danger"
        : "border-white/15 bg-white/[0.05] text-mist-300";
  const Icon = notice.tone === "ok" ? CheckCircle2 : notice.tone === "err" ? AlertTriangle : Info;
  return (
    <div className={cn("flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-[0.84rem]", tone)}>
      <span className="flex items-start gap-2">
        <Icon size={15} className="mt-0.5 shrink-0" />
        <span>{notice.text}</span>
      </span>
      <button onClick={onDismiss} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100">
        ✕
      </button>
    </div>
  );
}

/* ── Timeline stepper ──────────────────────────────────── */
function Timeline({ order }: { order: OrderDetail }) {
  const idx = FLOW.indexOf(order.status);
  const isTerminal = TERMINAL.includes(order.status);
  const stamps: Record<string, string | null> = {
    PENDING: order.placedAt,
    CONFIRMED: order.confirmedAt,
    PROCESSING: null,
    SHIPPED: order.shippedAt,
    OUT_FOR_DELIVERY: null,
    DELIVERED: order.deliveredAt,
  };

  if (isTerminal) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={order.status} />
        <span className="text-[0.84rem] text-mist-400">
          {order.cancelledAt
            ? `Cancelled ${formatDate(order.cancelledAt)}`
            : `Updated ${formatDate(order.updatedAt)}`}
        </span>
      </div>
    );
  }

  return (
    <ol className="flex flex-wrap items-start gap-y-4">
      {FLOW.map((step, i) => {
        const done = idx >= 0 && i <= idx;
        const current = i === idx;
        const stamp = stamps[step];
        return (
          <li key={step} className="flex min-w-[8.5rem] flex-1 items-start gap-2.5">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[0.66rem] font-bold",
                  done
                    ? "border-gold-500/60 bg-gold-500/20 text-gold-300"
                    : "border-white/15 bg-white/[0.03] text-mist-600"
                )}
              >
                {i + 1}
              </span>
              {i < FLOW.length - 1 && (
                <span
                  className={cn(
                    "mt-1 w-px flex-1",
                    idx > i ? "bg-gold-500/40" : "bg-white/[0.08]"
                  )}
                />
              )}
            </div>
            <div className="pb-1">
              <p
                className={cn(
                  "text-[0.76rem] font-semibold uppercase tracking-wide",
                  current ? "text-gold-300" : done ? "text-mist-200" : "text-mist-600"
                )}
              >
                {step.replace(/_/g, " ")}
              </p>
              <p className="text-[0.68rem] text-mist-600">
                {stamp ? formatDate(stamp, "short") : done ? "—" : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ── Main client ───────────────────────────────────────── */
export function OrderDetailClient({
  order,
  externalReady = false,
}: {
  order: OrderDetail;
  /** True when the partner connection (live mode + base URL + API key) exists server-side. */
  externalReady?: boolean;
}) {
  const router = useRouter();

  // Status change
  const [statusChoice, setStatusChoice] = useState(order.status);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusConfirm, setStatusConfirm] = useState(false);
  const [statusNotice, setStatusNotice] = useState<Notice | null>(null);

  // Sync actions
  const [pendingAction, setPendingAction] = useState<{
    action: SyncAction;
    message: string;
  } | null>(null);
  const [markId, setMarkId] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncNotice, setSyncNotice] = useState<Notice | null>(null);

  const s = order.externalSyncStatus;
  const canRetry = s === "PENDING" || s === "FAILED" || s === "NOT_CONFIGURED";
  const canVerify = s === "SYNC_TIMEOUT";
  const canMarkSynced = s !== "SYNCED";
  const canPull = Boolean(order.externalOrderId);

  const askSync = (action: SyncAction) => {
    setSyncNotice(null);
    if (action === "retry") {
      setPendingAction({
        action,
        message:
          "Send this order to the partner API now? Automatic forwarding is off, so nothing goes out unless you press this. If the partner site does not have this product the push fails and shows the exact reason — then handle the order manually.",
      });
    } else if (action === "verify") {
      setPendingAction({
        action,
        message:
          "Ask the external system whether this order already exists (by order number / idempotency key). This is the safe alternative to retrying a timed-out push.",
      });
    } else if (action === "releaseRetry") {
      setPendingAction({
        action,
        message:
          "Confirm the order was NOT created externally (checked out-of-band). This unlocks a retry — only do this if you verified manually, otherwise you risk a duplicate.",
      });
    } else if (action === "markSynced") {
      setMarkId(order.externalOrderId ?? "");
      setPendingAction({
        action,
        message:
          "Manually mark this order as synchronized with an external order ID you confirmed exists. Use only when lookup is unavailable and you verified out-of-band.",
      });
    } else {
      setPendingAction({
        action,
        message: "Pull the latest external status / tracking into this order?",
      });
    }
  };

  const runSync = async () => {
    if (!pendingAction) return;
    setSyncBusy(true);
    setSyncNotice(null);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: pendingAction.action,
          ...(pendingAction.action === "markSynced"
            ? { externalOrderId: markId.trim() }
            : {}),
        }),
      });
      const json = await res.json().catch(() => ({ ok: false }));
      if (!json.ok) {
        setSyncNotice({ tone: "err", text: json.message ?? "Sync action failed" });
      } else {
        const d = json.data as {
          ok: boolean;
          outcome: { status: string; message: string };
        };
        const muted = d.outcome.status === "NOT_CONFIGURED" || d.outcome.status === "SKIPPED";
        setSyncNotice({
          tone: d.ok ? "ok" : muted ? "info" : "err",
          text: d.outcome.message,
        });
        router.refresh();
      }
    } catch {
      setSyncNotice({ tone: "err", text: "Network error — please try again" });
    } finally {
      setSyncBusy(false);
      setPendingAction(null);
    }
  };

  const applyStatus = async () => {
    setStatusBusy(true);
    setStatusNotice(null);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: statusChoice }),
      });
      const json = await res.json().catch(() => ({ ok: false }));
      if (!json.ok) {
        setStatusNotice({ tone: "err", text: json.message ?? "Could not update the status" });
      } else {
        setStatusNotice({
          tone: "ok",
          text: `Status updated to ${statusChoice.replace(/_/g, " ")}`,
        });
        router.refresh();
      }
    } catch {
      setStatusNotice({ tone: "err", text: "Network error — please try again" });
    } finally {
      setStatusBusy(false);
      setStatusConfirm(false);
    }
  };

  const onApplyClick = () => {
    if (statusChoice === order.status) return;
    if (TERMINAL.includes(statusChoice)) setStatusConfirm(true);
    else void applyStatus();
  };

  const address = order.address;
  const addressLine = [address?.division, address?.district, address?.area]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-5">
      {/* Header + status control */}
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-display text-xl font-bold text-mist-50">{order.orderNumber}</h1>
              <StatusBadge status={order.status} />
              <StatusBadge status={order.paymentStatus} dot={false} />
              <StatusBadge status={order.externalSyncStatus} dot={false} />
            </div>
            <p className="mt-1 text-[0.82rem] text-mist-500">
              Placed {formatDate(order.placedAt)} · {timeAgo(order.placedAt)} · ID {order.id}
            </p>
          </div>
          <div className="flex items-end gap-2">
            <label className="block">
              <span className="mb-1.5 block text-[0.78rem] font-semibold text-mist-300">
                Order status
              </span>
              <Select
                value={statusChoice}
                onChange={(e) => setStatusChoice(e.target.value)}
                className="w-52"
              >
                {ORDER_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
            </label>
            <BusyBtn
              busy={statusBusy}
              onClick={onApplyClick}
              disabled={statusChoice === order.status}
            >
              Update
            </BusyBtn>
          </div>
        </div>
        {statusNotice && (
          <div className="mt-4">
            <NoticeBar notice={statusNotice} onDismiss={() => setStatusNotice(null)} />
          </div>
        )}
      </Panel>

      {/* Timeline */}
      <Panel title="Timeline" subtitle="Fulfillment progress of this order">
        <Timeline order={order} />
        {(order.customerNote || order.instructions) && (
          <div className="mt-4 space-y-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            {order.customerNote && (
              <p className="text-[0.82rem] text-mist-300">
                <span className="font-semibold text-mist-200">Customer note:</span> {order.customerNote}
              </p>
            )}
            {order.instructions && (
              <p className="text-[0.82rem] text-mist-300">
                <span className="font-semibold text-mist-200">Delivery instructions:</span>{" "}
                {order.instructions}
              </p>
            )}
          </div>
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Items + totals */}
        <div className="space-y-5 lg:col-span-2">
          <Panel title={`Items (${order.items.length})`} padded={false}>
            <Table>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th>SKU</Th>
                  <Th className="text-right">Unit</Th>
                  <Th className="text-right">Qty</Th>
                  <Th className="text-right">Line total</Th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((it) => (
                  <tr key={it.id}>
                    <Td>
                      <div className="min-w-0">
                        <span className="block truncate font-semibold text-mist-100">
                          {it.productName}
                        </span>
                        {it.variantLabel && (
                          <span className="text-[0.74rem] text-mist-600">{it.variantLabel}</span>
                        )}
                        {it.lineDiscount > 0 && (
                          <span className="text-[0.74rem] text-success">
                            −{formatBDT(it.lineDiscount)} line discount
                          </span>
                        )}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap font-mono text-[0.78rem] text-mist-500">
                      {it.sku}
                    </Td>
                    <Td className="whitespace-nowrap text-right">{formatBDT(it.unitPrice)}</Td>
                    <Td className="text-right">×{it.quantity}</Td>
                    <Td className="whitespace-nowrap text-right font-semibold text-gold-300">
                      {formatBDT(it.lineTotal)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="space-y-2 border-t border-white/[0.07] p-5 text-[0.86rem]">
              <div className="flex justify-between text-mist-400">
                <span>Subtotal</span>
                <span>{formatBDT(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-mist-400">
                <span>Discount {order.couponCode ? `(${order.couponCode})` : ""}</span>
                <span className={order.discount > 0 ? "text-success" : undefined}>
                  {order.discount > 0 ? `−${formatBDT(order.discount)}` : formatBDT(0)}
                </span>
              </div>
              <div className="flex justify-between text-mist-400">
                <span>Delivery charge</span>
                <span>{formatBDT(order.deliveryCharge)}</span>
              </div>
              <div className="flex justify-between border-t border-white/[0.07] pt-2.5 font-display text-lg font-bold text-mist-50">
                <span>Grand total</span>
                <span className="text-gold-300">{formatBDT(order.total)}</span>
              </div>
            </div>
          </Panel>

          {/* Payments */}
          <Panel title="Payment">
            <div className="flex flex-wrap items-center gap-2.5">
              <StatusBadge status={order.paymentStatus} />
              <span className="text-[0.84rem] text-mist-300">Method: {order.paymentMethod}</span>
            </div>
            {order.payments.length > 0 ? (
              <div className="mt-3 space-y-2">
                {order.payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[0.8rem]"
                  >
                    <span className="text-mist-300">
                      {formatBDT(p.amount)} · {p.method}
                      {p.transactionId ? ` · TXN ${p.transactionId}` : ""}
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusBadge status={p.status} dot={false} />
                      <span className="text-mist-600">{formatDate(p.createdAt, "short")}</span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[0.82rem] text-mist-600">
                No separate payment records — payment is handled via {order.paymentMethod}.
              </p>
            )}
            {(order.trackingNumber || order.trackingUrl) && (
              <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[0.8rem] text-mist-300">
                Tracking: {order.trackingNumber ?? "—"}
                {order.trackingUrl && (
                  <a
                    href={order.trackingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-2 text-gold-300 underline-offset-2 hover:underline"
                  >
                    Open
                  </a>
                )}
              </div>
            )}
          </Panel>
        </div>

        {/* Customer + address */}
        <div className="space-y-5">
          <Panel title="Customer" action={<User size={15} className="text-mist-600" />}>
            <div className="space-y-1.5 text-[0.85rem]">
              <p className="font-semibold text-mist-100">{order.customerName}</p>
              <p className="text-mist-400">{order.customerPhone}</p>
              {order.customerEmail && <p className="break-all text-mist-400">{order.customerEmail}</p>}
              {order.user ? (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2">
                  <span className="text-[0.8rem] text-mist-300">Registered account</span>
                  <StatusBadge status={order.user.status} dot={false} />
                </div>
              ) : (
                <p className="text-[0.76rem] text-mist-600">Guest checkout (no account)</p>
              )}
              {order.user && (
                <Link
                  href={`/admin/customers/${order.user.id}`}
                  className="inline-block pt-1 text-[0.8rem] text-gold-300 transition hover:text-gold-200"
                >
                  View customer →
                </Link>
              )}
            </div>
          </Panel>

          <Panel title="Shipping address" action={<MapPin size={15} className="text-mist-600" />}>
            <div className="space-y-1 text-[0.85rem] text-mist-300">
              {address?.fullName && <p className="font-semibold text-mist-100">{address.fullName}</p>}
              {addressLine && <p className="text-mist-400">{addressLine}</p>}
              {address?.fullAddress && <p>{address.fullAddress}</p>}
              {address?.instructions && (
                <p className="text-mist-500">Note: {address.instructions}</p>
              )}
              {!address || (!address.fullAddress && !addressLine) ? (
                <p className="text-mist-600">No address snapshot recorded for this order.</p>
              ) : null}
            </div>
          </Panel>

          {order.adminNotes && (
            <Panel title="Admin notes">
              <p className="whitespace-pre-wrap text-[0.84rem] text-mist-300">{order.adminNotes}</p>
            </Panel>
          )}
        </div>
      </div>

      {/* External sync */}
      <Panel
        title="External sync"
        subtitle="Order forwarding to the fulfillment partner — failures are never hidden"
        action={<RefreshCcw size={15} className="text-mist-600" />}
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <StatusBadge status={order.externalSyncStatus} />
          <span className="text-[0.82rem] text-mist-400">
            Attempts: {order.syncAttempts}
            {order.externalOrderId ? ` · External ID: ${order.externalOrderId}` : ""}
            {order.syncedAt ? ` · Synced ${formatDate(order.syncedAt, "short")}` : ""}
          </span>
        </div>

        {order.lastSyncError && s !== "SYNCED" && (
          <p className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-[0.8rem] text-danger">
            {order.lastSyncError}
          </p>
        )}
        {s === "SYNC_TIMEOUT" && (
          <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[0.8rem] text-amber-400">
            This push timed out — the external system may or may not have created the order.
            Verify before retrying to avoid duplicates.
          </p>
        )}
        {s === "NOT_CONFIGURED" && (
          <p className="mt-3 rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2 text-[0.8rem] text-mist-400">
            External API is not configured — the order has not been forwarded anywhere yet.
          </p>
        )}
        {s === "SYNCING" && (
          <p className="mt-3 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-[0.8rem] text-sky-400">
            A push is currently in progress.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Btn
            variant="outline"
            onClick={() => askSync("verify")}
            disabled={!canVerify || syncBusy}
            className="!px-3 !py-2"
          >
            Verify (timeout)
          </Btn>
          <Btn
            variant="outline"
            onClick={() => askSync("retry")}
            disabled={!canRetry || syncBusy || !externalReady}
            className="!px-3 !py-2"
          >
            Push to API
          </Btn>
          <Btn
            variant="outline"
            onClick={() => askSync("releaseRetry")}
            disabled={!canVerify || syncBusy}
            className="!px-3 !py-2"
          >
            Release retry
          </Btn>
          <Btn
            variant="outline"
            onClick={() => askSync("markSynced")}
            disabled={!canMarkSynced || syncBusy}
            className="!px-3 !py-2"
          >
            Mark synced…
          </Btn>
          <Btn
            variant="outline"
            onClick={() => askSync("pullStatus")}
            disabled={!canPull || syncBusy}
            className="!px-3 !py-2"
          >
            Pull status
          </Btn>
        </div>

        {!externalReady && (
          <p className="mt-3 rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2 text-[0.8rem] text-mist-500">
            No partner API connection yet — add the base URL and API key in Settings → External
            API, then this order can be pushed from here.
          </p>
        )}

        {pendingAction && (
          <div className="mt-4 rounded-xl border border-gold-500/30 bg-gold-500/[0.06] p-4">
            <p className="text-[0.84rem] leading-relaxed text-mist-300">{pendingAction.message}</p>
            {pendingAction.action === "markSynced" && (
              <input
                value={markId}
                onChange={(e) => setMarkId(e.target.value)}
                placeholder="External order ID (confirmed to exist)"
                className="input-premium mt-3 w-full max-w-md"
              />
            )}
            <div className="mt-3 flex justify-end gap-2">
              <Btn variant="outline" onClick={() => setPendingAction(null)} className="!px-3 !py-2">
                Cancel
              </Btn>
              <BusyBtn
                busy={syncBusy}
                onClick={runSync}
                disabled={pendingAction.action === "markSynced" && !markId.trim()}
              >
                Confirm
              </BusyBtn>
            </div>
          </div>
        )}

        {syncNotice && (
          <div className="mt-4">
            <NoticeBar notice={syncNotice} onDismiss={() => setSyncNotice(null)} />
          </div>
        )}

        {/* Sync log history */}
        <div className="mt-5">
          <p className="mb-2 text-[0.78rem] font-bold uppercase tracking-[0.14em] text-mist-600">
            Sync log history
          </p>
          {order.syncLogs.length === 0 ? (
            <p className="text-[0.82rem] text-mist-600">
              No sync attempts recorded for this order yet.
            </p>
          ) : (
            <Table className="rounded-xl border border-white/[0.07]">
              <thead>
                <tr>
                  <Th>Time</Th>
                  <Th>Direction</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Attempt</Th>
                  <Th className="text-right">Duration</Th>
                  <Th>Result</Th>
                </tr>
              </thead>
              <tbody>
                {order.syncLogs.map((l) => (
                  <tr key={l.id}>
                    <Td className="whitespace-nowrap">
                      <span className="block text-mist-300">{formatDate(l.createdAt, "short")}</span>
                      <span className="block text-[0.7rem] text-mist-600">{timeAgo(l.createdAt)}</span>
                    </Td>
                    <Td className="whitespace-nowrap font-mono text-[0.76rem] text-mist-400">
                      {l.direction}
                    </Td>
                    <Td>
                      <StatusBadge status={l.status === "SUCCESS" ? "SYNCED" : l.status === "TIMEOUT" ? "SYNC_TIMEOUT" : l.status} dot={false} />
                    </Td>
                    <Td className="text-right">#{l.attempt}</Td>
                    <Td className="text-right whitespace-nowrap text-mist-500">
                      {l.durationMs != null ? `${l.durationMs}ms` : "—"}
                    </Td>
                    <Td className="max-w-[24ch] truncate text-[0.78rem] text-mist-500" >
                      {l.error ?? "OK"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <Link
            href={`/admin/sync?orderId=${order.id}`}
            className="mt-3 inline-block text-[0.8rem] text-gold-300 transition hover:text-gold-200"
          >
            Open in Sync Center →
          </Link>
        </div>
      </Panel>

      <ConfirmDialog
        open={statusConfirm}
        title="Confirm status change"
        message={`Set this order to ${statusChoice.replace(/_/g, " ")}? This is a terminal state and will be recorded in the audit log.`}
        confirmLabel="Update status"
        busy={statusBusy}
        onConfirm={applyStatus}
        onCancel={() => setStatusConfirm(false)}
      />
    </div>
  );
}
