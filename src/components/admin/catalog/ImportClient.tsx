"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  Search,
  TriangleAlert,
} from "lucide-react";
import { cn, formatBDT } from "@/lib/utils";

export interface ImportLocal {
  id: string;
  status: string;
  price: number;
}

export interface ImportRow {
  /** Partner id, falling back to their SKU — what the import API selects on. */
  key: string;
  partnerId: string | null;
  code: string | null;
  name: string;
  slug: string | null;
  category: string | null;
  image: string | null;
  /** What our customer will pay (partner `regular_price`). */
  customerPrice: number | null;
  /** What we pay the partner (their `reseller_price`) — admin only. */
  costPrice: number | null;
  inStock: boolean;
  local: ImportLocal | null;
}

interface ImportSummary {
  fetched: number;
  selected: number;
  created: number;
  updated: number;
  skipped: number;
  categoriesCreated: number;
  missingFromPartner: number;
  errors: string[];
  durationMs: number;
}

type Filter = "all" | "new" | "imported";
type Notice = { tone: "ok" | "err"; text: string } | null;

/**
 * Partner catalog import screen.
 *
 * Every row can be imported on its own, or any selection can be imported
 * together — nothing is imported until a button is pressed. The numbers in
 * the notice are the ones the server actually got; a partner/auth failure
 * shows as an error, never as a fake success.
 */
export function ImportClient({
  rows,
  loadedAt,
  cached,
  error,
}: {
  rows: ImportRow[];
  loadedAt: string | null;
  cached: boolean;
  error: string | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [picked, setPicked] = useState<string[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [bulk, setBulk] = useState<null | "selected" | "all">(null);
  const [notice, setNotice] = useState<Notice>(null);

  const counts = useMemo(
    () => ({
      all: rows.length,
      new: rows.filter((r) => !r.local).length,
      imported: rows.filter((r) => Boolean(r.local)).length,
    }),
    [rows]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "new" && r.local) return false;
      if (filter === "imported" && !r.local) return false;
      if (!q) return true;
      return [r.name, r.code ?? "", r.category ?? "", r.slug ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [rows, filter, query]);

  const importable = (list: ImportRow[]) =>
    list.map((r) => r.key).filter((k) => k.trim().length > 0);

  const runImport = async (keys: string[], label: string) => {
    const codes = keys.map((k) => k.trim()).filter(Boolean);
    if (!codes.length) {
      setNotice({ tone: "err", text: "Nothing to import — no products selected." });
      return;
    }
    setNotice(null);
    try {
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes }),
      });
      const json = (await res.json().catch(() => ({ ok: false }))) as {
        ok?: boolean;
        message?: string;
        data?: ImportSummary;
      };
      if (!json.ok || !json.data) {
        setNotice({ tone: "err", text: json.message ?? "Import failed" });
        return;
      }
      const d = json.data;
      const bits = [
        `${d.selected} selected`,
        `${d.created} new`,
        `${d.updated} updated`,
      ];
      if (d.skipped) bits.push(`${d.skipped} skipped`);
      const failed = d.errors.length;
      if (failed) bits.push(`${failed} problem${failed === 1 ? "" : "s"}`);

      setNotice({
        tone: failed ? "err" : "ok",
        text: `${label}: ${bits.join(" · ")} — ${(d.durationMs / 1000).toFixed(1)}s${
          failed && d.errors[0] ? ` · ${d.errors[0]}` : ""
        }`,
      });
      setPicked([]);
      router.refresh();
    } catch {
      setNotice({ tone: "err", text: "Network error — please try again" });
    }
  };

  const runOne = async (row: ImportRow) => {
    setBusyKey(row.key);
    await runImport([row.key], row.local ? `Updated “${row.name}”` : `Imported “${row.name}”`);
    setBusyKey(null);
  };

  const runSelected = async () => {
    setBulk("selected");
    const keys = picked.filter((k) => k.trim());
    await runImport(keys, `${keys.length} selected`);
    setBulk(null);
  };

  const runAll = async () => {
    if (
      !window.confirm(
        `Import ALL ${rows.length} partner products? Existing ones are updated, nothing is duplicated.`
      )
    )
      return;
    setBulk("all");
    await runImport(importable(rows), "Full catalog");
    setBulk(null);
  };

  const toggle = (key: string) =>
    setPicked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const allVisiblePicked =
    visible.length > 0 && importable(visible).every((k) => picked.includes(k));

  const toggleAllVisible = () => {
    const keys = importable(visible);
    setPicked((prev) =>
      allVisiblePicked ? prev.filter((k) => !keys.includes(k)) : [...new Set([...prev, ...keys])]
    );
  };

  const loadedLabel = loadedAt
    ? new Date(loadedAt).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------- toolbar */}
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mist-500"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, SKU or category…"
              className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-9 pr-3 text-sm text-mist-200 outline-none placeholder:text-mist-500 focus:border-gold-500/40"
            />
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
            {(
              [
                ["all", `All ${counts.all}`],
                ["new", `New ${counts.new}`],
                ["imported", `Imported ${counts.imported}`],
              ] as [Filter, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-[0.78rem] font-semibold transition",
                  filter === key
                    ? "bg-gold-500/15 text-gold-300"
                    : "text-mist-400 hover:text-mist-200"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-[0.75rem] text-mist-500">
            {loadedLabel ? (
              <span>
                Catalog loaded {loadedLabel}
                {cached ? " (cached — under 2 min old)" : ""}
              </span>
            ) : (
              <span>Catalog not loaded</span>
            )}
            <Link
              href="/admin/import?refresh=1"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-mist-300 transition hover:border-gold-500/40 hover:text-gold-300"
            >
              <RefreshCw size={12} /> Refresh from partner
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={runSelected}
              disabled={Boolean(bulk) || picked.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-white/12 px-4 py-2 text-[0.82rem] font-semibold text-mist-300 transition hover:border-gold-500/40 hover:text-gold-300 disabled:opacity-40"
            >
              {bulk === "selected" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Download size={14} />
              )}
              Import selected ({picked.length})
            </button>
            <button
              type="button"
              onClick={runAll}
              disabled={Boolean(bulk) || rows.length === 0}
              className="btn-gold inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[0.82rem] disabled:opacity-50"
            >
              {bulk === "all" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Download size={14} />
              )}
              Import all ({rows.length})
            </button>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------- notices */}
      {error && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}
      {notice && (
        <div
          className={cn(
            "flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm",
            notice.tone === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-danger/40 bg-danger/10 text-danger"
          )}
        >
          {notice.tone === "ok" ? (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          ) : (
            <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          )}
          <p>{notice.text}</p>
        </div>
      )}

      {/* ---------------------------------------------------- table */}
      {!error && rows.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 px-6 py-14 text-center text-sm text-mist-400">
          No products returned by the partner catalog.
        </div>
      ) : (
        !error && (
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/20">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-[0.72rem] uppercase tracking-wider text-mist-500">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allVisiblePicked}
                      onChange={toggleAllVisible}
                      disabled={visible.length === 0}
                      aria-label="Select all visible products"
                      className="accent-gold-500"
                    />
                  </th>
                  <th className="px-2 py-3">Product</th>
                  <th className="px-3 py-3">Category</th>
                  <th className="px-3 py-3 text-right">Customer price</th>
                  <th className="px-3 py-3 text-right">Cost</th>
                  <th className="px-3 py-3">Stock</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const busy = busyKey === r.key;
                  return (
                    <tr
                      key={r.key || r.name}
                      className="border-b border-white/5 transition last:border-0 hover:bg-white/[0.03]"
                    >
                      <td className="px-4 py-3 align-middle">
                        <input
                          type="checkbox"
                          checked={picked.includes(r.key)}
                          onChange={() => toggle(r.key)}
                          disabled={!r.key}
                          aria-label={`Select ${r.name}`}
                          className="accent-gold-500"
                        />
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-3">
                          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/40">
                            {r.image ? (
                              <img
                                src={r.image}
                                alt=""
                                loading="lazy"
                                className="h-full w-full object-cover"
                              />
                            ) : null}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-mist-100" title={r.name}>
                              {r.name}
                            </p>
                            <p className="truncate text-[0.72rem] text-mist-500">
                              {r.code ?? "—"}
                              {r.slug ? ` · ${r.slug}` : ""}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-mist-300">{r.category ?? "—"}</td>
                      <td className="px-3 py-3 text-right font-semibold text-gold-300">
                        {r.customerPrice !== null ? formatBDT(r.customerPrice) : "—"}
                      </td>
                      <td className="px-3 py-3 text-right text-mist-400">
                        {r.costPrice !== null ? formatBDT(r.costPrice) : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "rounded-md px-2 py-0.5 text-[0.7rem] font-semibold",
                            r.inStock
                              ? "bg-emerald-500/10 text-emerald-300"
                              : "bg-white/5 text-mist-500"
                          )}
                        >
                          {r.inStock ? "In stock" : "Out of stock"}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {r.local ? (
                          <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[0.7rem] font-semibold text-emerald-300">
                            Imported
                          </span>
                        ) : (
                          <span className="rounded-md bg-gold-500/10 px-2 py-0.5 text-[0.7rem] font-semibold text-gold-300">
                            New
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => runOne(r)}
                          disabled={!r.key || Boolean(bulk) || busy}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-3 py-1.5 text-[0.75rem] font-semibold text-mist-300 transition hover:border-gold-500/40 hover:text-gold-300 disabled:opacity-40"
                        >
                          {busy ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Download size={12} />
                          )}
                          {busy ? "Importing…" : r.local ? "Update" : "Import"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-mist-500">
                      No product matches this search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
