"use client";

import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, CircleDashed, Loader2, PackageSearch, Search } from "lucide-react";
import { formatBDT, formatDate, cn } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface TrackResult {
  orderNumber: string;
  status: string;
  statusLabel: string;
  paymentMethod: string;
  paymentStatus: string;
  total: number;
  placedAt: string;
  deliveredAt: string | null;
  timeline: { key: string; label: string; active: boolean }[];
  cancelled: boolean;
  trackingNumber: string | null;
  trackingUrl: string | null;
  items: {
    name: string;
    quantity: number;
    image: string | null;
    variantLabel: string | null;
    lineTotal: number;
  }[];
  delivery: { district: string | null; area: string | null; fullAddress: string | null };
  external: { status: string; synced: boolean };
}

/** Public order tracker: order number + phone/email gate. */
export function TrackOrderClient() {
  const params = useSearchParams();
  const [orderNumber, setOrderNumber] = useState(params.get("orderNumber") ?? "");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TrackResult | null>(null);

  const lookup = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    setError(null);
    setResult(null);

    if (!orderNumber.trim() || !contact.trim()) {
      setError("Enter both your order number and phone/email");
      return;
    }

    setBusy(true);
    try {
      const qs = new URLSearchParams({
        orderNumber: orderNumber.trim(),
        contact: contact.trim().toLowerCase(),
      });
      const res = await fetch(`/api/track?${qs.toString()}`);
      const json = await res.json().catch(() => ({ ok: false }));
      if (json.ok) setResult(json.data as TrackResult);
      else setError(json.message ?? "Order not found");
    } catch {
      setError("Network error — please try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      {/* Lookup card */}
      <div className="rounded-3xl border border-gold-500/20 bg-gradient-to-b from-ink-800 to-ink-900 p-6 shadow-lift sm:p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-gold-500/25 bg-gold-500/[0.07] text-gold-400">
            <PackageSearch size={22} />
          </div>
          <h1 className="font-display text-2xl font-bold text-mist-50">Track Your Order</h1>
          <p className="mt-1.5 text-sm text-mist-400">
            Enter your order number (e.g. IMAL-2026-000001) and the phone or email used at
            checkout.
          </p>
        </div>

        <form onSubmit={lookup} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[0.78rem] font-semibold text-mist-300">
              Order number
            </label>
            <input
              className="input-premium uppercase"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
              placeholder="IMAL-2026-000001"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[0.78rem] font-semibold text-mist-300">
              Phone or email
            </label>
            <input
              className="input-premium"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="017XXXXXXXX or you@email.com"
            />
          </div>

          {error && (
            <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-[0.84rem] text-danger sm:col-span-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="btn-gold flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm sm:col-span-2"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            {busy ? "Searching…" : "Track Order"}
          </button>
        </form>
      </div>

      {/* Result */}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 rounded-3xl border border-white/[0.08] bg-white/[0.02] p-6 sm:p-7"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-display text-xl font-bold text-mist-50">{result.orderNumber}</p>
              <p className="text-[0.8rem] text-mist-500">Placed {formatDate(result.placedAt)}</p>
            </div>
            <StatusBadge status={result.status} />
          </div>

          {/* Timeline */}
          {!result.cancelled ? (
            <ol className="mt-7 grid grid-cols-3 gap-4 sm:grid-cols-6">
              {result.timeline.map((step, i) => (
                <li key={step.key} className="flex flex-col items-center text-center">
                  <div
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full border",
                      step.active
                        ? "border-gold-500/60 bg-gold-500/[0.12] text-gold-300"
                        : "border-white/10 bg-white/[0.03] text-mist-600"
                    )}
                  >
                    {step.active ? <CheckCircle2 size={17} /> : <CircleDashed size={17} />}
                  </div>
                  <p
                    className={cn(
                      "mt-2 text-[0.7rem] leading-tight",
                      step.active ? "text-mist-200" : "text-mist-600"
                    )}
                  >
                    {step.label}
                  </p>
                  <span className="sr-only">{i + 1}</span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="mt-6 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              This order was {result.statusLabel.toLowerCase()}.
            </div>
          )}

          {/* Tracking number */}
          {result.trackingNumber && (
            <div className="mt-6 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 text-[0.85rem] text-mist-300">
              Courier tracking:{" "}
              {result.trackingUrl ? (
                <a
                  href={result.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-gold-400 underline"
                >
                  {result.trackingNumber}
                </a>
              ) : (
                <strong className="text-gold-300">{result.trackingNumber}</strong>
              )}
            </div>
          )}

          {/* Items */}
          <div className="mt-6 space-y-3 border-t border-white/[0.07] pt-5">
            {result.items.map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-white/[0.08] bg-ink-800">
                  {item.image &&
                    (item.image.endsWith(".svg") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                    ) : (
                      <Image src={item.image} alt={item.name} fill sizes="48px" className="object-cover" />
                    ))}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-[0.88rem] text-mist-100">{item.name}</p>
                  <p className="text-[0.74rem] text-mist-500">
                    {item.variantLabel ? `${item.variantLabel} · ` : ""}Qty {item.quantity}
                  </p>
                </div>
                <p className="text-[0.88rem] font-semibold text-gold-300">
                  {formatBDT(item.lineTotal)}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-5 space-y-2 border-t border-white/[0.07] pt-4 text-[0.85rem]">
            <div className="flex justify-between text-mist-400">
              <span>Payment method</span>
              <span className="flex items-center gap-2 text-mist-200">
                {result.paymentMethod} <StatusBadge status={result.paymentStatus} dot={false} />
              </span>
            </div>
            <div className="flex justify-between text-mist-400">
              <span>Delivering to</span>
              <span className="text-mist-200">
                {[result.delivery.area, result.delivery.district].filter(Boolean).join(", ") ||
                  result.delivery.fullAddress ||
                  "—"}
              </span>
            </div>
            <div className="flex items-end justify-between pt-1">
              <span className="font-semibold text-mist-200">Total</span>
              <span className="font-display text-xl font-bold text-gold-gradient">
                {formatBDT(result.total)}
              </span>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-4 text-[0.8rem]">
            <Link href="/contact" className="text-gold-400 transition hover:text-gold-300">
              Need help? Contact us
            </Link>
            <Link href="/auth/login" className="text-mist-500 transition hover:text-gold-400">
              Looking for your full order history? Sign in
            </Link>
          </div>
        </motion.div>
      )}
    </div>
  );
}
