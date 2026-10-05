"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, Star, Trash2, X } from "lucide-react";
import {
  Panel,
  Table,
  Th,
  Td,
  Empty,
  SearchInput,
  Select,
  ConfirmDialog,
} from "@/components/admin/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Pagination } from "@/components/ui/Pagination";
import { cn, formatDate, timeAgo } from "@/lib/utils";

/** One review row — server-serialized. */
export interface ReviewRow {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  status: string; // PENDING | APPROVED | REJECTED
  isVerified: boolean;
  createdAt: string;
  productId: string;
  productName: string;
  productSlug: string;
  reviewer: string;
}

type RowMessage = { ok: boolean; text: string };

async function api(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    const json = await res.json().catch(() => ({ ok: false, message: "Unexpected server response" }));
    return { ok: Boolean(json.ok), message: json.message as string | undefined };
  } catch {
    return { ok: false, message: "Network error — please try again" };
  }
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={13}
          className={i <= rating ? "fill-gold-400 text-gold-400" : "text-mist-700"}
        />
      ))}
    </span>
  );
}

export function ReviewsClient({
  items,
  totalPages,
  page,
  searchParams,
}: {
  items: ReviewRow[];
  total: number;
  totalPages: number;
  page: number;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const router = useRouter();
  const get = (k: string) => {
    const v = searchParams[k];
    return typeof v === "string" ? v : "";
  };

  const urlQ = get("q");
  const rating = get("rating");
  const status = get("status");

  const [q, setQ] = useState(urlQ);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // `${id}:${action}`
  const [rowMsgs, setRowMsgs] = useState<Record<string, RowMessage>>({});
  const [deleting, setDeleting] = useState<ReviewRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

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
    router.push(`/admin/reviews${qs ? `?${qs}` : ""}`);
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

  /* ── Mutations ──────────────────────────────────────────────────── */

  const setStatus = async (row: ReviewRow, next: "APPROVED" | "REJECTED") => {
    const key = `${row.id}:${next}`;
    setBusy(key);
    setNotice(null);
    const res = await api(`/api/admin/reviews/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: next }),
    });
    setBusy(null);
    if (res.ok) {
      setRowMsgs((m) => ({
        ...m,
        [row.id]: {
          ok: true,
          text: next === "APPROVED" ? "Approved — now visible on the product page" : "Hidden from the storefront",
        },
      }));
      router.refresh();
    } else {
      setRowMsgs((m) => ({
        ...m,
        [row.id]: { ok: false, text: res.message ?? "Could not update the review" },
      }));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setError(null);
    const res = await api(`/api/admin/reviews/${deleting.id}`, { method: "DELETE" });
    setDeleting(null);
    setDeleteBusy(false);
    if (res.ok) {
      setNotice("Review deleted");
      router.refresh();
    } else {
      setError(res.message ?? "Could not delete the review");
    }
  };

  /* ── Render ─────────────────────────────────────────────────────── */

  const hasFilters = Boolean(urlQ || rating || status);

  return (
    <div>
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

      {notice && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-[0.84rem] text-success">
          <span className="flex gap-2">
            <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
            {notice}
          </span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="shrink-0 text-success/80 hover:text-success">
            <X size={14} />
          </button>
        </div>
      )}

      <Panel padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.07] p-5">
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder="Search product, reviewer or text…"
            className="w-full sm:w-72"
          />
          <Select value={rating} onChange={(e) => push({ rating: e.target.value })} className="sm:w-40">
            <option value="">All ratings</option>
            <option value="5">5 stars</option>
            <option value="4">4 stars</option>
            <option value="3">3 stars</option>
            <option value="2">2 stars</option>
            <option value="1">1 star</option>
          </Select>
          <Select value={status} onChange={(e) => push({ status: e.target.value })} className="sm:w-44">
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Hidden</option>
          </Select>
        </div>

        {items.length === 0 ? (
          <div className="p-5">
            <Empty
              title={hasFilters ? "No reviews match your filters" : "No reviews yet"}
              hint={
                hasFilters
                  ? "Try a different search term, or clear the filters above."
                  : "Customer reviews appear here once they start rolling in."
              }
            />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Rating</Th>
                <Th>Product</Th>
                <Th>Review</Th>
                <Th>Reviewer</Th>
                <Th>Status</Th>
                <Th>Date</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const msg = rowMsgs[r.id];
                return (
                  <tr key={r.id} className="transition hover:bg-white/[0.02]">
                    <Td>
                      <Stars rating={r.rating} />
                    </Td>
                    <Td className="max-w-[20ch]">
                      <Link
                        href={`/admin/products/${r.productId}`}
                        className="block truncate font-semibold text-mist-100 transition hover:text-gold-300"
                        title={r.productName}
                      >
                        {r.productName}
                      </Link>
                    </Td>
                    <Td className="max-w-[34ch]">
                      {r.title && <p className="font-semibold text-mist-100">{r.title}</p>}
                      {r.comment ? (
                        <p className="line-clamp-2 text-[0.8rem] text-mist-400" title={r.comment}>
                          {r.comment}
                        </p>
                      ) : (
                        !r.title && <span className="text-mist-600">—</span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap">
                      <p className="font-semibold text-mist-200">{r.reviewer}</p>
                      {r.isVerified && (
                        <span className="mt-0.5 inline-block rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide text-success">
                          Verified buyer
                        </span>
                      )}
                    </Td>
                    <Td>
                      <StatusBadge status={r.status} />
                    </Td>
                    <Td className="whitespace-nowrap text-mist-500">
                      <span title={formatDate(r.createdAt)}>{timeAgo(r.createdAt)}</span>
                    </Td>
                    <Td>
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1">
                          {r.status !== "APPROVED" && (
                            <button
                              onClick={() => setStatus(r, "APPROVED")}
                              disabled={busy === `${r.id}:APPROVED`}
                              className="rounded-lg px-2 py-1.5 text-[0.74rem] text-mist-500 transition hover:bg-white/[0.06] hover:text-success disabled:opacity-50"
                            >
                              {busy === `${r.id}:APPROVED` ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                "Approve"
                              )}
                            </button>
                          )}
                          {r.status !== "REJECTED" && (
                            <button
                              onClick={() => setStatus(r, "REJECTED")}
                              disabled={busy === `${r.id}:REJECTED`}
                              className="rounded-lg px-2 py-1.5 text-[0.74rem] text-mist-500 transition hover:bg-white/[0.06] hover:text-amber-300 disabled:opacity-50"
                            >
                              {busy === `${r.id}:REJECTED` ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                "Hide"
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => setDeleting(r)}
                            aria-label="Delete review"
                            title="Delete"
                            className="rounded-lg p-2 text-mist-500 transition hover:bg-danger/10 hover:text-danger"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        {msg && (
                          <p
                            className={cn(
                              "max-w-[26ch] text-right text-[0.72rem]",
                              msg.ok ? "text-success" : "text-danger"
                            )}
                          >
                            {msg.text}
                          </p>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>

      <Pagination
        page={page}
        totalPages={totalPages}
        basePath="/admin/reviews"
        searchParams={searchParams}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Delete review"
        message={`Delete this ${deleting?.rating ?? ""}-star review permanently? The customer's rating will be removed from the product average.`}
        confirmLabel="Delete"
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
