"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
  MessageSquare,
  Package,
  X,
} from "lucide-react";
import { Panel, Table, Th, Td, Empty, Btn, BusyBtn } from "@/components/admin/ui";
import { AlertSoundSettings } from "@/components/admin/AlertSoundSettings";
import { cn, formatDate, timeAgo } from "@/lib/utils";

/**
 * System Log: newest first. Every row shows the actual content of the
 * alert ("what it says"), and the Seen button stamps the name of the
 * admin who pressed it (first press wins — server-enforced).
 */

interface AlertRow {
  id: string;
  type: "ORDER" | "MESSAGE";
  title: string;
  body: string | null;
  link: string | null;
  seenAt: string | null;
  seenByName: string | null;
  createdAt: string;
}

const PAGE_SIZE = 20;

async function api<T>(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; data?: T; message?: string }> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    const json = await res.json().catch(() => ({ ok: false, message: "Unexpected server response" }));
    return {
      ok: Boolean(json.ok),
      data: json.data as T | undefined,
      message: json.message as string | undefined,
    };
  } catch {
    return { ok: false, message: "Network error — please try again" };
  }
}

export function AlertsClient() {
  const [rows, setRows] = useState<AlertRow[]>([]);
  const [total, setTotal] = useState(0);
  const [unseen, setUnseen] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    const res = await api<{
      items: AlertRow[];
      total: number;
      unseen: number;
      page: number;
      totalPages: number;
    }>(`/api/admin/alerts?page=${p}&size=${PAGE_SIZE}`);
    if (res.ok && res.data) {
      setRows(res.data.items);
      setTotal(res.data.total);
      setUnseen(res.data.unseen);
      setPage(res.data.page);
      setTotalPages(res.data.totalPages);
      setError(null);
    } else {
      setError(res.message ?? "Could not load the System Log");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(1);
  }, [load]);

  const markSeen = async (row: AlertRow) => {
    setBusyId(row.id);
    setError(null);
    const res = await api<{ id: string; seenAt: string | null; seenByName: string | null }>(
      `/api/admin/alerts/${row.id}`,
      { method: "PATCH", body: JSON.stringify({ action: "seen" }) }
    );
    if (res.ok && res.data) {
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? { ...r, seenAt: res.data!.seenAt, seenByName: res.data!.seenByName }
            : r
        )
      );
      setUnseen((u) => Math.max(0, u - 1));
    } else {
      setError(res.message ?? "Could not mark the alert as seen");
    }
    setBusyId(null);
  };

  return (
    <div>
      <AlertSoundSettings />
      {error && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-[0.84rem] text-danger">
          <span className="flex gap-2">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            {error}
          </span>
          <button onClick={() => setError(null)} aria-label="Dismiss" className="shrink-0 text-danger/80 hover:text-danger">
            <X size={14} />
          </button>
        </div>
      )}

      <Panel
        title="Alerts"
        subtitle="New orders and contact messages"
        action={
          unseen > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-500/40 bg-gold-500/10 px-3 py-1 text-[0.74rem] font-semibold text-gold-300">
              <span className="h-1.5 w-1.5 rounded-full bg-gold-400" />
              {unseen} unseen
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[0.74rem] text-mist-500">
              <CheckCircle2 size={12} className="text-emerald-400" /> All seen
            </span>
          )
        }
      >
        {loading ? (
          <div className="flex items-center gap-2 py-10 text-[0.86rem] text-mist-500">
            <Loader2 size={16} className="animate-spin" /> Loading alerts…
          </div>
        ) : rows.length === 0 ? (
          <Empty
            title="No alerts yet"
            hint="New orders and contact-form messages will appear here automatically."
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Type</Th>
                  <Th>Alert</Th>
                  <Th>Link</Th>
                  <Th className="text-right">Seen</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={cn("transition hover:bg-white/[0.02]", !row.seenAt && "bg-gold-500/[0.04]")}>
                    <Td className="whitespace-nowrap text-mist-500">
                      <span title={formatDate(row.createdAt)}>{timeAgo(row.createdAt)}</span>
                    </Td>
                    <Td>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-wide",
                          row.type === "ORDER"
                            ? "border-gold-500/40 bg-gold-500/10 text-gold-300"
                            : "border-sky-500/30 bg-sky-500/10 text-sky-300"
                        )}
                      >
                        {row.type === "ORDER" ? <Package size={11} /> : <MessageSquare size={11} />}
                        {row.type === "ORDER" ? "Order" : "Message"}
                      </span>
                    </Td>
                    <Td>
                      <p className="font-semibold text-mist-100">{row.title}</p>
                      {row.body && (
                        <p className="mt-0.5 whitespace-pre-wrap break-words text-[0.78rem] leading-snug text-mist-500 line-clamp-3">
                          {row.body}
                        </p>
                      )}
                      <p className="mt-1 text-[0.7rem] text-mist-600">{formatDate(row.createdAt)}</p>
                    </Td>
                    <Td>
                      {row.link ? (
                        <Link
                          href={row.link}
                          className="inline-flex items-center gap-1 text-[0.78rem] text-gold-400 transition hover:text-gold-300"
                        >
                          Open <ExternalLink size={11} />
                        </Link>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td className="text-right">
                      {row.seenAt ? (
                        <span
                          className="inline-flex items-center gap-1.5 whitespace-nowrap text-[0.78rem] text-emerald-300"
                          title={formatDate(row.seenAt)}
                        >
                          <CheckCircle2 size={13} />
                          {row.seenByName ? `Seen by ${row.seenByName}` : "Seen"}
                          <span className="text-mist-600">· {timeAgo(row.seenAt)}</span>
                        </span>
                      ) : (
                        <BusyBtn
                          busy={busyId === row.id}
                          variant="outline"
                          onClick={() => markSeen(row)}
                        >
                          Seen
                        </BusyBtn>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>

            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-[0.76rem] text-mist-600">
                {total} alert{total === 1 ? "" : "s"} total
              </p>
              <div className="flex items-center gap-2">
                <Btn
                  variant="outline"
                  disabled={page <= 1 || loading}
                  onClick={() => load(page - 1)}
                >
                  <ArrowLeft size={13} /> Prev
                </Btn>
                <span className="text-[0.76rem] text-mist-500">
                  Page {page} of {totalPages}
                </span>
                <Btn
                  variant="outline"
                  disabled={page >= totalPages || loading}
                  onClick={() => load(page + 1)}
                >
                  Next <ArrowRight size={13} />
                </Btn>
              </div>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
