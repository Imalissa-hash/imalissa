"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import {
  Panel,
  Table,
  Th,
  Td,
  Empty,
  Select,
  StatCard,
  Modal,
  Btn,
  BusyBtn,
} from "@/components/admin/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Pagination } from "@/components/ui/Pagination";
import { cn, formatDate, timeAgo } from "@/lib/utils";

/** One sync log row — server-serialized. */
export interface SyncLogRow {
  id: string;
  orderId: string;
  orderNumber: string;
  orderCustomer: string;
  orderSyncStatus: string;
  direction: string;
  status: string;
  attempt: number;
  error: string | null;
  durationMs: number | null;
  createdAt: string;
}

export interface SyncStats {
  logs: Record<string, number>;
  orders: Record<string, number>;
}

interface SyncLogDetail {
  id: string;
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  orderSyncStatus: string;
  customerName: string;
  direction: string;
  status: string;
  attempt: number;
  durationMs: number | null;
  error: string | null;
  request: string | null;
  response: string | null;
  createdAt: string;
}

interface Notice {
  tone: "ok" | "err" | "info";
  text: string;
}

const LOG_STATUSES = ["SUCCESS", "FAILED", "TIMEOUT", "SKIPPED", "NOT_CONFIGURED"];

const logBadge = (status: string) =>
  status === "SUCCESS"
    ? "SYNCED"
    : status === "TIMEOUT"
      ? "SYNC_TIMEOUT"
      : status === "FAILED"
        ? "FAILED"
        : status;

export function SyncCenterClient({
  items,
  total,
  totalPages,
  page,
  searchParams,
  stats,
  directions,
}: {
  items: SyncLogRow[];
  total: number;
  totalPages: number;
  page: number;
  searchParams: Record<string, string | string[] | undefined>;
  stats: SyncStats;
  directions: string[];
}) {
  const router = useRouter();
  const get = (k: string) => {
    const v = searchParams[k];
    return typeof v === "string" ? v : "";
  };

  const status = get("status");
  const direction = get("direction");
  const orderId = get("orderId");

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
    router.push(`/admin/sync${qs ? `?${qs}` : ""}`);
  };

  /* ── Detail modal ─────────────────────────────────────── */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SyncLogDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Action state inside the modal
  const [pending, setPending] = useState<"retry" | "verify" | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<Notice | null>(null);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setDetail(null);
    setDetailError(null);
    setPending(null);
    setActionMsg(null);
    setDetailLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/admin/sync/${selectedId}`);
        const json = await res.json().catch(() => ({ ok: false }));
        if (cancelled) return;
        if (json.ok) setDetail(json.data);
        else setDetailError(json.message ?? "Could not load the log entry");
      } catch {
        if (!cancelled) setDetailError("Network error — could not load the log entry");
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const runAction = async () => {
    if (!detail || !pending) return;
    setActionBusy(true);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/admin/orders/${detail.orderId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: pending }),
      });
      const json = await res.json().catch(() => ({ ok: false }));
      if (!json.ok) {
        setActionMsg({ tone: "err", text: json.message ?? "Action failed" });
      } else {
        const d = json.data as {
          ok: boolean;
          outcome: { status: string; message: string };
          sync: { externalSyncStatus: string };
        };
        const muted = d.outcome.status === "NOT_CONFIGURED" || d.outcome.status === "SKIPPED";
        setActionMsg({
          tone: d.ok ? "ok" : muted ? "info" : "err",
          text: d.outcome.message,
        });
        setDetail({ ...detail, orderSyncStatus: d.sync.externalSyncStatus });
        router.refresh();
      }
    } catch {
      setActionMsg({ tone: "err", text: "Network error — please try again" });
    } finally {
      setActionBusy(false);
      setPending(null);
    }
  };

  const hasFilters = Boolean(status || direction || orderId);

  return (
    <div>
      {/* KPI strip — honest counts by status */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <StatCard label="Logs succeeded" value={stats.logs.SUCCESS ?? 0} tone="success" />
        <StatCard label="Logs failed" value={stats.logs.FAILED ?? 0} tone="danger" />
        <StatCard label="Logs timed out" value={stats.logs.TIMEOUT ?? 0} tone="gold" />
        <StatCard label="Orders synced" value={stats.orders.SYNCED ?? 0} tone="success" />
        <StatCard label="Orders failed" value={stats.orders.FAILED ?? 0} tone="danger" />
        <StatCard
          label="Orders timed out"
          value={stats.orders.SYNC_TIMEOUT ?? 0}
          tone="danger"
          hint="Verify before retry"
        />
      </div>

      <Panel padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.07] p-5">
          <Select
            value={status}
            onChange={(e) => push({ status: e.target.value })}
            className="sm:w-48"
            aria-label="Filter by log status"
          >
            <option value="">All log statuses</option>
            {LOG_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
          <Select
            value={direction}
            onChange={(e) => push({ direction: e.target.value })}
            className="sm:w-56"
            aria-label="Filter by direction"
          >
            <option value="">All directions</option>
            {directions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
          {orderId && (
            <span className="flex items-center gap-2 rounded-full border border-gold-500/40 bg-gold-500/[0.08] px-3 py-1.5 text-[0.76rem] text-gold-300">
              Filtered to one order
              <button onClick={() => push({ orderId: null })} aria-label="Clear order filter">
                <X size={12} />
              </button>
            </span>
          )}
          {hasFilters && (
            <button
              onClick={() => push({ status: null, direction: null, orderId: null })}
              className="rounded-lg border border-white/10 px-3 py-2 text-[0.78rem] text-mist-400 transition hover:border-gold-500/40 hover:text-gold-300"
            >
              Clear filters
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="p-5">
            <Empty
              title={hasFilters ? "No log entries match these filters" : "No sync activity yet"}
              hint={
                hasFilters
                  ? "Try different filters, or clear them above."
                  : "Every push / pull attempt is recorded here automatically."
              }
            />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Time</Th>
                <Th>Order</Th>
                <Th>Direction</Th>
                <Th>Result</Th>
                <Th className="text-right">Attempt</Th>
                <Th className="text-right">Duration</Th>
                <Th>Error / note</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr
                  key={l.id}
                  onClick={() => setSelectedId(l.id)}
                  className="cursor-pointer transition hover:bg-white/[0.03]"
                  title="View request / response"
                >
                  <Td className="whitespace-nowrap">
                    <span className="block text-mist-300">{formatDate(l.createdAt, "short")}</span>
                    <span className="block text-[0.72rem] text-mist-600">{timeAgo(l.createdAt)}</span>
                  </Td>
                  <Td>
                    <div className="min-w-0">
                      <Link
                        href={`/admin/orders/${l.orderId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="block truncate font-semibold text-gold-300 hover:text-gold-200"
                      >
                        {l.orderNumber}
                      </Link>
                      <span className="block truncate text-[0.72rem] text-mist-600">
                        {l.orderCustomer}
                      </span>
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap font-mono text-[0.76rem] text-mist-400">
                    {l.direction}
                  </Td>
                  <Td>
                    <StatusBadge status={logBadge(l.status)} dot={false} />
                  </Td>
                  <Td className="text-right">#{l.attempt}</Td>
                  <Td className="whitespace-nowrap text-right text-mist-500">
                    {l.durationMs != null ? `${l.durationMs}ms` : "—"}
                  </Td>
                  <Td className="max-w-[26ch]">
                    <span
                      className={cn(
                        "block truncate text-[0.78rem]",
                        l.status === "SUCCESS" ? "text-mist-600" : "text-danger/90"
                      )}
                      title={l.error ?? undefined}
                    >
                      {l.error ? (l.error.length > 80 ? `${l.error.slice(0, 80)}…` : l.error) : "—"}
                    </span>
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
        basePath="/admin/sync"
        searchParams={searchParams}
      />

      {/* Detail modal */}
      <Modal
        open={selectedId !== null}
        onClose={() => setSelectedId(null)}
        title="Sync log entry"
        wide
      >
        {detailLoading ? (
          <div className="flex items-center gap-2 py-8 text-[0.86rem] text-mist-500">
            <Loader2 size={16} className="animate-spin" /> Loading log entry…
          </div>
        ) : detailError ? (
          <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-[0.84rem] text-danger">
            {detailError}
          </div>
        ) : detail ? (
          <div className="space-y-4">
            <div className="grid gap-2 text-[0.8rem] sm:grid-cols-2">
              <InfoBox label="Time" value={formatDate(detail.createdAt)} />
              <InfoBox label="Direction" value={detail.direction} />
              <InfoBox
                label="Order"
                value={`${detail.orderNumber} · ${detail.customerName}`}
              />
              <InfoBox
                label="Result"
                value={`${detail.status}${detail.durationMs != null ? ` · ${detail.durationMs}ms` : ""}${
                  detail.attempt ? ` · attempt #${detail.attempt}` : ""
                }`}
              />
              <InfoBox label="Order status" value={detail.orderStatus.replace(/_/g, " ")} />
              <InfoBox label="External sync" value={detail.orderSyncStatus.replace(/_/g, " ")} />
            </div>

            {detail.error && (
              <p
                className={cn(
                  "rounded-xl border px-3 py-2 text-[0.8rem]",
                  detail.status === "SUCCESS"
                    ? "border-white/10 bg-white/[0.04] text-mist-400"
                    : "border-danger/30 bg-danger/10 text-danger"
                )}
              >
                {detail.error}
              </p>
            )}

            {/* Actions for the underlying order */}
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[0.78rem] font-bold uppercase tracking-[0.14em] text-mist-600">
                    Order actions
                  </p>
                  <p className="text-[0.78rem] text-mist-500">
                    Current state:{" "}
                    <span className="font-semibold text-mist-300">
                      {detail.orderSyncStatus.replace(/_/g, " ")}
                    </span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Btn
                    variant="outline"
                    className="!px-3 !py-2"
                    disabled={
                      actionBusy ||
                      !["PENDING", "FAILED", "NOT_CONFIGURED"].includes(detail.orderSyncStatus)
                    }
                    onClick={() => setPending("retry")}
                  >
                    Retry push
                  </Btn>
                  <Btn
                    variant="outline"
                    className="!px-3 !py-2"
                    disabled={actionBusy || detail.orderSyncStatus !== "SYNC_TIMEOUT"}
                    onClick={() => setPending("verify")}
                  >
                    Verify (timeout)
                  </Btn>
                  <Link
                    href={`/admin/orders/${detail.orderId}`}
                    className="inline-flex items-center justify-center rounded-xl border border-white/12 px-3 py-2 text-[0.8rem] font-semibold text-mist-300 transition hover:border-gold-500/40 hover:text-gold-300"
                  >
                    Open order
                  </Link>
                </div>
              </div>

              {pending && (
                <div className="mt-3 rounded-xl border border-gold-500/30 bg-gold-500/[0.06] p-3">
                  <p className="text-[0.82rem] text-mist-300">
                    {pending === "retry"
                      ? "Push this order again? Only safe when the previous attempt is known to have failed — verify timeouts first."
                      : "Ask the external system whether this order already exists before any retry."}
                  </p>
                  <div className="mt-2.5 flex justify-end gap-2">
                    <Btn variant="outline" className="!px-3 !py-2" onClick={() => setPending(null)}>
                      Cancel
                    </Btn>
                    <BusyBtn busy={actionBusy} onClick={runAction}>
                      Confirm
                    </BusyBtn>
                  </div>
                </div>
              )}

              {actionMsg && (
                <p
                  className={cn(
                    "mt-3 rounded-xl border px-3 py-2 text-[0.8rem]",
                    actionMsg.tone === "ok"
                      ? "border-success/30 bg-success/10 text-success"
                      : actionMsg.tone === "err"
                        ? "border-danger/30 bg-danger/10 text-danger"
                        : "border-white/15 bg-white/[0.05] text-mist-300"
                  )}
                >
                  {actionMsg.text}
                </p>
              )}
            </div>

            <div>
              <p className="mb-1.5 text-[0.78rem] font-semibold text-mist-300">
                Request{" "}
                <span className="font-normal text-mist-600">(secrets redacted server-side)</span>
              </p>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border border-white/[0.07] bg-black/40 p-3 text-[0.74rem] leading-relaxed text-mist-300">
                {detail.request ?? "No request body recorded."}
              </pre>
            </div>
            <div>
              <p className="mb-1.5 text-[0.78rem] font-semibold text-mist-300">
                Response{" "}
                <span className="font-normal text-mist-600">(secrets redacted server-side)</span>
              </p>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border border-white/[0.07] bg-black/40 p-3 text-[0.74rem] leading-relaxed text-mist-300">
                {detail.response ?? "No response body recorded."}
              </pre>
            </div>

            <div className="flex justify-end">
              <Btn variant="outline" onClick={() => setSelectedId(null)}>
                <X size={14} /> Close
              </Btn>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
      <span className="block text-[0.68rem] uppercase tracking-[0.14em] text-mist-600">{label}</span>
      <span className="block break-all text-mist-200">{value}</span>
    </div>
  );
}
