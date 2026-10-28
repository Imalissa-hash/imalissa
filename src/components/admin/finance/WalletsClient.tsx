"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, ReceiptText, Search, X } from "lucide-react";
import { Panel, Field, TextInput, Btn, BusyBtn } from "@/components/admin/ui";
import { formatBDT, formatDate } from "@/lib/utils";

/**
 * Admin → Customer Wallets.
 *
 * Money never moves from here optimistically: the request goes to the API,
 * which refuses a balance that would go below zero, and only then does the
 * page re-read so the figure on screen is the one the database stored.
 *
 * Top-up and withdrawal are two ends of one control rather than two buttons
 * with their own signs — the admin says "add" or "remove" and the request
 * carries the signed amount. A minus sign cannot be typed into the wrong box.
 */

type Row = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  balance: string;
  lastMovedAt: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  TOPUP: "Top-up",
  REFUND: "Refund",
  ORDER_PAYMENT: "Spent on order",
  WITHDRAW: "Withdrawn",
  ADJUSTMENT: "Adjustment",
};

export function WalletsClient({
  rows,
  statement,
  query,
  canWrite,
  truncated,
}: {
  rows: Row[];
  statement: {
    customer: { id: string; name: string; email: string | null; phone: string | null };
    rows: {
      id: string;
      type: string;
      amount: string;
      balanceAfter: string;
      note: string | null;
      orderNumber: string | null;
      createdAt: string;
    }[];
  } | null;
  query: string;
  canWrite: boolean;
  truncated: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(query);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [direction, setDirection] = useState<"TOPUP" | "WITHDRAW">("TOPUP");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = (row: Row, dir: "TOPUP" | "WITHDRAW") => {
    setActiveId(row.id);
    setDirection(dir);
    setAmount("");
    setNote("");
    setError(null);
  };

  const submit = async (userId: string) => {
    const parsed = Number(amount);
    if (!amount || Number.isNaN(parsed) || parsed === 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    const signed = direction === "WITHDRAW" ? -Math.abs(parsed) : Math.abs(parsed);

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, type: direction, amount: signed, note: note.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) throw new Error(data.message || "Could not update the balance.");
      setActiveId(null);
      setAmount("");
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the balance.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── search ──────────────────────────────────────────────── */}
      <Panel padded className="flex flex-wrap items-end gap-3">
        <Field label="Find a customer" hint="Name, phone or email — leave empty to list wallet holders" className="min-w-[260px] flex-1">
          <TextInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const q = search.trim();
                router.push(q ? `/admin/wallets?q=${encodeURIComponent(q)}` : "/admin/wallets");
              }
            }}
            placeholder="Search customers…"
          />
        </Field>
        <Btn
          variant="outline"
          onClick={() => {
            const q = search.trim();
            router.push(q ? `/admin/wallets?q=${encodeURIComponent(q)}` : "/admin/wallets");
          }}
        >
          <Search size={14} /> Search
        </Btn>
        {query && (
          <Btn variant="outline" onClick={() => router.push("/admin/wallets")}>
            <X size={14} /> Clear
          </Btn>
        )}
      </Panel>

      {/* ── statement ───────────────────────────────────────────── */}
      {statement && (
        <Panel padded className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[0.86rem] font-semibold text-mist-100">
                {statement.customer.name}
              </p>
              <p className="text-[0.76rem] text-mist-500">
                {[statement.customer.phone, statement.customer.email].filter(Boolean).join(" · ")}
              </p>
            </div>
            <Btn variant="outline" onClick={() => router.push("/admin/wallets")}>
              <X size={14} /> Close statement
            </Btn>
          </div>

          {statement.rows.length === 0 ? (
            <p className="py-6 text-center text-[0.85rem] text-mist-500">
              This customer has no wallet history yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[0.82rem]">
                <thead>
                  <tr className="border-b border-white/[0.08] text-[0.7rem] uppercase tracking-wider text-mist-600">
                    <th className="py-2 pr-4 font-semibold">Date</th>
                    <th className="py-2 pr-4 font-semibold">Type</th>
                    <th className="py-2 pr-4 font-semibold">Note</th>
                    <th className="py-2 pr-4 text-right font-semibold">Amount</th>
                    <th className="py-2 text-right font-semibold">Balance after</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.rows.map((r) => {
                    const negative = r.amount.startsWith("-");
                    return (
                      <tr key={r.id} className="border-b border-white/[0.04] last:border-0">
                        <td className="whitespace-nowrap py-2.5 pr-4 text-mist-400">
                          {formatDate(r.createdAt)}
                        </td>
                        <td className="py-2.5 pr-4 text-mist-200">
                          {TYPE_LABEL[r.type] ?? r.type}
                          {r.orderNumber && (
                            <span className="ml-2 text-mist-600">#{r.orderNumber}</span>
                          )}
                        </td>
                        <td className="max-w-[280px] truncate py-2.5 pr-4 text-mist-400">
                          {r.note || "—"}
                        </td>
                        <td
                          className={`whitespace-nowrap py-2.5 pr-4 text-right font-semibold ${
                            negative ? "text-danger" : "text-emerald-300"
                          }`}
                        >
                          {negative ? "−" : "+"}
                          {formatBDT(r.amount.replace("-", ""), false)}
                        </td>
                        <td className="whitespace-nowrap py-2.5 text-right text-mist-300">
                          {formatBDT(r.balanceAfter)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {/* ── list ────────────────────────────────────────────────── */}
      <Panel padded>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-mist-600">
            Customers ({rows.length})
          </p>
          {truncated && (
            <span className="text-[0.74rem] text-mist-600">
              Showing the first {rows.length} — search to narrow down
            </span>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="py-8 text-center text-[0.85rem] text-mist-500">
            {query ? "No customer matches that search." : "No customer has a wallet balance yet."}
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.id} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.86rem] font-semibold text-mist-100">{row.name}</p>
                    <p className="text-[0.75rem] text-mist-500">
                      {[row.phone, row.email].filter(Boolean).join(" · ") || "No contact on file"}
                    </p>
                  </div>

                  <div className="text-right">
                    <p
                      className={`text-[0.95rem] font-bold ${
                        row.balance.startsWith("-") ? "text-danger" : "text-gold-300"
                      }`}
                    >
                      {formatBDT(row.balance)}
                    </p>
                    {row.lastMovedAt && (
                      <p className="text-[0.72rem] text-mist-600">
                        last moved {formatDate(row.lastMovedAt)}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <Link
                      href={`/admin/wallets?${query ? `q=${encodeURIComponent(query)}&` : ""}u=${row.id}`}
                      className="rounded-lg border border-white/[0.08] p-2 text-mist-400 transition hover:border-gold-500/40 hover:text-gold-300"
                      title="Statement"
                    >
                      <ReceiptText size={15} />
                    </Link>
                    {canWrite && (
                      <>
                        <button
                          type="button"
                          onClick={() => open(row, "TOPUP")}
                          className="rounded-lg border border-white/[0.08] p-2 text-mist-400 transition hover:border-emerald-500/40 hover:text-emerald-300"
                          title="Add credit"
                        >
                          <ArrowDownLeft size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => open(row, "WITHDRAW")}
                          className="rounded-lg border border-white/[0.08] p-2 text-mist-400 transition hover:border-danger/50 hover:text-danger"
                          title="Remove credit"
                        >
                          <ArrowUpRight size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {activeId === row.id && (
                  <div className="mt-3 border-t border-white/[0.06] pt-3">
                    {error && (
                      <div className="mb-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-2.5 text-[0.82rem] text-danger">
                        {error}
                      </div>
                    )}
                    <div className="grid gap-3 md:grid-cols-[190px_180px_1fr_auto]">
                      <Field label="Action">
                        <select
                          className="input-premium w-full"
                          value={direction}
                          onChange={(e) => setDirection(e.target.value as "TOPUP" | "WITHDRAW")}
                        >
                          <option value="TOPUP">Add credit</option>
                          <option value="WITHDRAW">Remove credit</option>
                        </select>
                      </Field>
                      <Field label="Amount (৳)">
                        <TextInput
                          type="number"
                          min="0"
                          step="0.01"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="0.00"
                        />
                      </Field>
                      <Field label="Reason" hint="Shown on the statement">
                        <TextInput
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Refund for order…, goodwill…"
                          maxLength={300}
                        />
                      </Field>
                      <div className="flex items-end gap-2">
                        <Btn variant="outline" onClick={() => setActiveId(null)} disabled={busy}>
                          Cancel
                        </Btn>
                        <BusyBtn busy={busy} onClick={() => submit(row.id)}>
                          Apply
                        </BusyBtn>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-[0.74rem] leading-relaxed text-mist-600">
          The shop&apos;s own money lives in the{" "}
          <Link
            href="/admin/cashbook"
            className="font-semibold text-gold-400 transition hover:text-gold-300"
          >
            Cash Book
          </Link>
          . Credit added here counts as money out; the customer spending it comes back as money in.
        </p>
      </Panel>
    </div>
  );
}
