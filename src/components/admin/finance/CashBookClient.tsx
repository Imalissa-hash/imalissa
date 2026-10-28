"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Landmark, SlidersHorizontal } from "lucide-react";
import { Panel, Field, TextInput, Btn, BusyBtn } from "@/components/admin/ui";
import { formatBDT, formatDate } from "@/lib/utils";

/**
 * Admin → Cash Book.
 *
 * The balance and the two period totals come from the server; posting an
 * entry is the only thing this component does, and it always re-reads the
 * page afterwards so the running balance shown is what the database stored —
 * never a number computed optimistically in the browser.
 *
 * The sign is decided by the type, not by the admin typing a minus: they pick
 * "Money in" or "Money out" and the request sends a positive or negative
 * amount. One fewer way to book money backwards.
 */

type Row = {
  id: string;
  type: string;
  amount: string;
  balanceAfter: string;
  note: string | null;
  orderNumber: string | null;
  createdAt: string;
};

const TYPE_LABEL: Record<string, string> = {
  ORDER_PAYMENT: "Order paid",
  WALLET_SPEND: "Paid from wallet",
  WALLET_TOPUP: "Wallet credit given",
  REFUND: "Refund",
  WITHDRAWAL: "Wallet withdrawn",
  DEPOSIT: "Owner deposit",
  EXPENSE: "Expense",
  ADJUSTMENT: "Adjustment",
};

export function CashBookClient({
  balance,
  todayIn,
  todayOut,
  monthIn,
  monthOut,
  monthCount,
  rows,
  from,
  to,
  truncated,
  canWrite,
}: {
  balance: string;
  todayIn: string;
  todayOut: string;
  monthIn: string;
  monthOut: string;
  monthCount: number;
  rows: Row[];
  from: string;
  to: string;
  truncated: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [type, setType] = useState<"DEPOSIT" | "EXPENSE" | "ADJUSTMENT">("DEPOSIT");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const parsed = Number(amount);
    if (!amount || Number.isNaN(parsed) || parsed === 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    // "Money out" books a negative amount without the admin typing a sign.
    const signed = type === "EXPENSE" ? -Math.abs(parsed) : Math.abs(parsed);

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/cashbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, amount: signed, note: note.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) throw new Error(data.message || "Could not record that entry.");
      setAmount("");
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record that entry.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── summary ─────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Current balance"
          value={formatBDT(balance)}
          accent
          icon={<Landmark size={16} />}
        />
        <Stat
          label="Today in / out"
          value={formatBDT(todayIn)}
          sub={`out ${formatBDT(todayOut)}`}
          icon={<ArrowDownLeft size={16} />}
        />
        <Stat
          label="This month in"
          value={formatBDT(monthIn)}
          sub={`${monthCount} entries`}
          icon={<ArrowDownLeft size={16} />}
        />
        <Stat
          label="This month out"
          value={formatBDT(monthOut)}
          icon={<ArrowUpRight size={16} />}
        />
      </div>

      {/* ── record an entry ─────────────────────────────────────── */}
      {canWrite ? (
        <Panel padded className="space-y-3">
          <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-mist-600">
            Record money in or out
          </p>
          <p className="text-[0.78rem] leading-relaxed text-mist-500">
            Orders and refunds are recorded automatically when they happen. Use this only for
            money with no order behind it — your own deposits, shipping and ad costs, or a
            correction.
          </p>

          {error && (
            <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-[0.84rem] text-danger">
              {error}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-[180px_200px_1fr_auto]">
            <Field label="Type">
              <select
                className="input-premium w-full"
                value={type}
                onChange={(e) => setType(e.target.value as typeof type)}
              >
                <option value="DEPOSIT">Money in — deposit</option>
                <option value="EXPENSE">Money out — expense</option>
                <option value="ADJUSTMENT">Correction</option>
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
            <Field label="Note" hint="What it was for">
              <TextInput
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Courier fuel, Facebook ads…"
                maxLength={300}
              />
            </Field>
            <div className="flex items-end">
              <BusyBtn busy={busy} onClick={submit}>
                Record
              </BusyBtn>
            </div>
          </div>
        </Panel>
      ) : (
        <Panel padded>
          <p className="text-[0.82rem] text-mist-500">
            You can read the cash book but not add to it — that needs the
            <span className="mx-1 font-semibold text-mist-300">Edit orders</span> permission.
          </p>
        </Panel>
      )}

      {/* ── date filter ─────────────────────────────────────────── */}
      <Panel padded className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <SlidersHorizontal size={15} className="mb-2 text-mist-600" />
          <Field label="From">
            <TextInput type="date" defaultValue={from} id="cb-from" />
          </Field>
          <Field label="To">
            <TextInput type="date" defaultValue={to} id="cb-to" />
          </Field>
          <Btn
            variant="outline"
            onClick={() => {
              const f = (document.getElementById("cb-from") as HTMLInputElement | null)?.value ?? "";
              const t = (document.getElementById("cb-to") as HTMLInputElement | null)?.value ?? "";
              const q = new URLSearchParams();
              if (f) q.set("from", f);
              if (t) q.set("to", t);
              router.push(`/admin/cashbook${q.toString() ? `?${q}` : ""}`);
            }}
          >
            Apply
          </Btn>
          {(from || to) && (
            <Btn variant="outline" onClick={() => router.push("/admin/cashbook")}>
              Clear
            </Btn>
          )}
        </div>
      </Panel>

      {/* ── entries ─────────────────────────────────────────────── */}
      <Panel padded>
        <p className="mb-3 text-[0.7rem] font-semibold uppercase tracking-wider text-mist-600">
          Entries ({rows.length})
        </p>
        {truncated && (
          <p className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-[0.78rem] text-amber-200">
            Showing the most recent 300. Use the date filter to see older ones.
          </p>
        )}
        {rows.length === 0 ? (
          <p className="py-8 text-center text-[0.85rem] text-mist-500">
            Nothing recorded in this range yet.
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
                {rows.map((r) => {
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
                      <td className="max-w-[320px] truncate py-2.5 pr-4 text-mist-400">
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
        <p className="mt-4 text-[0.74rem] leading-relaxed text-mist-600">
          Wallet balances live separately —{" "}
          <Link
            href="/admin/wallets"
            className="font-semibold text-gold-400 transition hover:text-gold-300"
          >
            Customer Wallets
          </Link>
          . Credit handed to a customer appears here as money out, and their spending it comes
          back as money in.
        </p>
      </Panel>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  icon: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        accent ? "border-gold-500/30 bg-gold-500/[0.06]" : "border-white/[0.08] bg-white/[0.03]"
      }`}
    >
      <div className="flex items-center gap-2 text-mist-600">
        {icon}
        <span className="text-[0.7rem] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p className={`mt-2 text-xl font-bold ${accent ? "text-gold-300" : "text-mist-50"}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[0.74rem] text-mist-600">{sub}</p>}
    </div>
  );
}
