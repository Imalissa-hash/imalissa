"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X, History, Undo2 } from "lucide-react";
import {
  Panel,
  Table,
  Th,
  Td,
  Empty,
  SearchInput,
  Select,
  ConfirmDialog,
  Modal,
} from "@/components/admin/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Pagination } from "@/components/ui/Pagination";
import { formatBDT, formatDate, timeAgo } from "@/lib/utils";

/** One order row — server-serialized (Decimals → numbers, Dates → ISO). */
export interface OrderRow {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  total: number;
  itemCount: number;
  externalSyncStatus: string;
  placedAt: string;
  /** Set only in the Delete history view (soft-deleted orders). */
  deletedAt?: string | null;
}

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

export function OrdersClient({
  items,
  total,
  totalPages,
  page,
  searchParams,
  deletedCount,
}: {
  items: OrderRow[];
  total: number;
  totalPages: number;
  page: number;
  searchParams: Record<string, string | string[] | undefined>;
  deletedCount: number;
}) {
  const router = useRouter();
  const get = (k: string) => {
    const v = searchParams[k];
    return typeof v === "string" ? v : "";
  };

  const status = get("status");
  const payment = get("payment");
  const urlQ = get("q");

  const [q, setQ] = useState(urlQ);

  /* Failed-order delete — only status FAILED is deletable, and the deletion
     is recorded in Admin → Audit Log (action ORDER_DELETE) as the history. */
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<OrderRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${deleting.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({ ok: false }));
      setDeleting(null);
      if (!json.ok) setError(json.message ?? "Could not delete the order");
      else router.refresh();
    } catch {
      setDeleting(null);
      setError("Network error — please try again");
    } finally {
      setDeleteBusy(false);
    }
  };

  /* ── Delete history (soft-deleted orders) + restore ────────────────
     Deleted rows are hidden everywhere, listed here and brought back
     with one click (clears `deletedAt`, nothing is re-created). */
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<OrderRow[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const openHistory = async () => {
    setHistoryOpen(true);
    setHistory(null);
    setHistoryError(null);
    try {
      const res = await fetch("/api/admin/orders?deleted=1");
      const json = await res.json().catch(() => ({ ok: false }));
      if (!json.ok) setHistoryError(json.message ?? "Could not load the delete history");
      else setHistory((json.data?.items ?? []) as OrderRow[]);
    } catch {
      setHistoryError("Network error — please try again");
    }
  };

  const restoreOrder = async (row: OrderRow) => {
    setRestoringId(row.id);
    setHistoryError(null);
    try {
      const res = await fetch(`/api/admin/orders/${row.id}/restore`, { method: "POST" });
      const json = await res.json().catch(() => ({ ok: false }));
      if (!json.ok) {
        setHistoryError(json.message ?? "Could not restore the order");
      } else {
        setHistory((prev) => (prev ?? []).filter((r) => r.id !== row.id));
        router.refresh();
      }
    } catch {
      setHistoryError("Network error — please try again");
    } finally {
      setRestoringId(null);
    }
  };

  /** Navigate with merged filter changes (always resets to page 1). */
  const push = (patch: Record<string, string | null>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (typeof v === "string") sp.set(k, v);
      else if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
    }
    sp.delete("page");
    for (const [k, v] of Object.entries(patch)) {
      if (!v) sp.delete(k);
      else sp.set(k, v);
    }
    const qs = sp.toString();
    router.push(`/admin/orders${qs ? `?${qs}` : ""}`);
  };

  // Debounced search → server navigation.
  useEffect(() => {
    const t = setTimeout(() => {
      const next = q.trim();
      if (next !== urlQ) push({ q: next || null });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const hasFilters = Boolean(urlQ || status || payment);

  return (
    <div>
      {error && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-[0.84rem] text-danger">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss" className="shrink-0">
            <X size={14} />
          </button>
        </div>
      )}
      <Panel padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.07] p-5">
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder="Search order #, name, phone…"
            className="w-full sm:w-72"
          />
          <Select value={status} onChange={(e) => push({ status: e.target.value })} className="sm:w-48">
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
          <Select value={payment} onChange={(e) => push({ payment: e.target.value })} className="sm:w-44">
            <option value="">Any payment</option>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
          {hasFilters && (
            <button
              onClick={() => {
                setQ("");
                push({ q: null, status: null, payment: null });
              }}
              className="rounded-lg border border-white/10 px-3 py-2 text-[0.78rem] text-mist-400 transition hover:border-gold-500/40 hover:text-gold-300"
            >
              Clear filters
            </button>
          )}
          <button
            type="button"
            onClick={openHistory}
            className="ml-auto inline-flex items-center gap-2 rounded-lg border border-white/12 px-3 py-2 text-[0.78rem] font-semibold text-mist-300 transition hover:border-gold-500/40 hover:text-gold-300"
          >
            <History size={14} />
            Delete history
            <span
              className={
                deletedCount > 0
                  ? "rounded-full border border-danger/40 bg-danger/10 px-1.5 py-0.5 text-[0.68rem] font-bold text-danger"
                  : "rounded-full border border-white/15 px-1.5 py-0.5 text-[0.68rem] font-bold text-mist-500"
              }
            >
              {deletedCount}
            </span>
          </button>
        </div>

        {items.length === 0 ? (
          <div className="p-5">
            <Empty
              title={hasFilters ? "No orders match your filters" : "No orders yet"}
              hint={
                hasFilters
                  ? "Try a different search term, or clear the filters above."
                  : "Orders placed on the storefront will appear here."
              }
            />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Placed</Th>
                <Th>Customer</Th>
                <Th className="text-right">Items</Th>
                <Th>Payment</Th>
                <Th className="text-right">Total</Th>
                <Th>Status</Th>
                <Th>Sync</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => router.push(`/admin/orders/${o.id}`)}
                  className="cursor-pointer transition hover:bg-white/[0.03]"
                  title={`Open ${o.orderNumber}`}
                >
                  <Td>
                    <span className="block whitespace-nowrap font-semibold text-gold-300">
                      {o.orderNumber}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap">
                    <span className="block text-mist-300">{formatDate(o.placedAt, "short")}</span>
                    <span className="block text-[0.72rem] text-mist-600">{timeAgo(o.placedAt)}</span>
                  </Td>
                  <Td>
                    <div className="min-w-0">
                      <span className="block truncate font-semibold text-mist-100">{o.customerName}</span>
                      <span className="block truncate text-[0.74rem] text-mist-600">
                        {o.customerPhone}
                        {o.customerEmail ? ` · ${o.customerEmail}` : ""}
                      </span>
                    </div>
                  </Td>
                  <Td className="text-right whitespace-nowrap">{o.itemCount}</Td>
                  <Td>
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadge status={o.paymentStatus} dot={false} />
                      <span className="text-[0.7rem] uppercase tracking-wide text-mist-600">
                        {o.paymentMethod}
                      </span>
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap text-right">
                    <span className="font-display font-semibold text-gold-300">{formatBDT(o.total)}</span>
                  </Td>
                  <Td>
                    <StatusBadge status={o.status} dot={false} />
                  </Td>
                  <Td>
                    <StatusBadge status={o.externalSyncStatus} dot={false} />
                  </Td>
                  <Td className="text-right">
                    {o.status === "FAILED" ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleting(o);
                        }}
                        aria-label={`Delete ${o.orderNumber}`}
                        title="Delete failed order"
                        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-danger/40 px-2.5 py-1.5 text-[0.72rem] font-semibold text-danger transition hover:bg-danger/10"
                      >
                        <Trash2 size={13} />
                        Delete
                      </button>
                    ) : (
                      <span className="text-mist-600">—</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      <Pagination
        page={page}
        totalPages={totalPages}
        basePath="/admin/orders"
        searchParams={searchParams}
      />

      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="Delete history" wide>
        <p className="text-[0.84rem] leading-relaxed text-mist-500">
          Orders removed from this list. They stay out of customers, reports and the dashboard —
          Restore puts one back exactly as it was (same items, totals and status).
        </p>

        {historyError && (
          <div className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-[0.8rem] text-danger">
            {historyError}
          </div>
        )}

        <div className="mt-4">
          {history === null ? (
            <p className="py-8 text-center text-[0.85rem] text-mist-600">Loading…</p>
          ) : history.length === 0 ? (
            <Empty
              title="Nothing deleted yet"
              hint="Failed orders you delete will be listed here, ready to restore."
            />
          ) : (
            <div className="space-y-2">
              {history.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3.5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-gold-300">{r.orderNumber}</span>
                    <span className="block truncate text-[0.74rem] text-mist-600">
                      {r.customerName} · {r.customerPhone} · {r.itemCount} item
                      {r.itemCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="block font-display font-semibold text-mist-100">
                      {formatBDT(r.total)}
                    </span>
                    <span className="block text-[0.7rem] text-mist-600">
                      deleted {r.deletedAt ? timeAgo(r.deletedAt) : "—"}
                    </span>
                  </div>
                  <StatusBadge status={r.status} dot={false} />
                  <button
                    type="button"
                    onClick={() => restoreOrder(r)}
                    disabled={restoringId !== null}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gold-500/40 px-3 py-1.5 text-[0.76rem] font-semibold text-gold-300 transition hover:bg-gold-500/10 disabled:opacity-50"
                  >
                    <Undo2 size={13} />
                    {restoringId === r.id ? "Restoring…" : "Restore"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete failed order"
        message={`Remove ${deleting?.orderNumber ?? ""} (${formatBDT(deleting?.total ?? 0)} · ${
          deleting?.itemCount ?? 0
        } item${(deleting?.itemCount ?? 0) === 1 ? "" : "s"}) from Orders, the customer's history and all reports? You can bring it back any time from Delete history (Restore), and every deletion is logged as ORDER_DELETE in Admin → Audit Log.`}
        confirmLabel="Delete order"
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
