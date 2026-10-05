"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { CheckCircle2, Package, ArrowRight, Home, Truck, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

/**
 * Order confirmation — shows the TRUE external-sync state (never fakes a
 * successful forward when the API failed).
 */
export function OrderConfirmed({
  orderNumber,
  syncStatus,
}: {
  orderNumber: string;
  syncStatus: string;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => setVisible(true), []);

  const syncTone =
    syncStatus === "SYNCED"
      ? "border-success/30 bg-success/[0.08] text-success"
      : syncStatus === "SYNC_TIMEOUT" || syncStatus === "FAILED"
        ? "border-warning/30 bg-warning/[0.08] text-warning"
        : "border-gold-500/30 bg-gold-500/[0.08] text-gold-300";

  const syncText: Record<string, string> = {
    SYNCED: "Your order has been forwarded to our fulfillment partner ✓",
    SYNC_TIMEOUT:
      "Your order is saved. Confirmation with our fulfillment partner is taking longer than usual — our team will complete it shortly.",
    FAILED:
      "Your order is saved and will be forwarded to our fulfillment partner shortly. You'll receive a confirmation call soon.",
    NOT_CONFIGURED:
      "Your order is saved. Fulfillment forwarding will be enabled once the external API connection is configured.",
    PENDING: "Your order is being forwarded to our fulfillment partner…",
    SKIPPED: "Your order has been received by our team.",
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={visible ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="overflow-hidden rounded-3xl border border-gold-500/25 bg-gradient-to-b from-ink-800 to-ink-900 text-center shadow-lift"
      >
        <div className="relative px-6 pt-10 sm:px-10">
          <motion.div
            initial={{ scale: 0.4, opacity: 0 }}
            animate={visible ? { scale: 1, opacity: 1 } : {}}
            transition={{ delay: 0.2, type: "spring", stiffness: 260, damping: 16 }}
            className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 border-success/40 bg-success/10"
          >
            <CheckCircle2 size={40} className="text-success" />
          </motion.div>

          <h1 className="mt-6 font-display text-3xl font-bold text-mist-50">
            Thank you for your order!
          </h1>
          <p className="mt-2 text-sm text-mist-400">
            A confirmation has been recorded. Keep your order number safe.
          </p>

          <div className="mx-auto mt-6 inline-flex flex-col items-center rounded-2xl border border-gold-500/30 bg-ink-950/60 px-8 py-4">
            <span className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-mist-500">
              Your order number
            </span>
            <motion.span
              initial={{ opacity: 0, letterSpacing: "0.4em" }}
              animate={visible ? { opacity: 1, letterSpacing: "0.14em" } : {}}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="mt-1 font-display text-2xl font-bold text-gold-gradient"
            >
              {orderNumber || "IMAL-2026-000000"}
            </motion.span>
          </div>

          {/* Honest sync status */}
          <div className={cn("mx-auto mt-5 max-w-md rounded-xl border px-4 py-3 text-[0.8rem]", syncTone)}>
            {syncText[syncStatus] ?? syncText.PENDING}
          </div>

          {/* What happens next */}
          <div className="mt-8 grid gap-3 text-left sm:grid-cols-3">
            {[
              { icon: Package, title: "Order received", text: "Saved in your account instantly" },
              { icon: Truck, title: "Fulfillment", text: "Packed & shipped by our partner" },
              { icon: RefreshCcw, title: "Track anytime", text: "Use your order number + phone" },
            ].map((s, i) => (
              <motion.div
                key={s.title}
                initial={{ opacity: 0, y: 14 }}
                animate={visible ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.5 + i * 0.12 }}
                className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5"
              >
                <s.icon size={17} className="text-gold-500" />
                <p className="mt-2 text-[0.8rem] font-semibold text-mist-100">{s.title}</p>
                <p className="text-[0.7rem] text-mist-500">{s.text}</p>
              </motion.div>
            ))}
          </div>

          <div className="mt-8 flex flex-col gap-3 pb-10 sm:flex-row sm:justify-center">
            <Link
              href={`/track-order?order=${encodeURIComponent(orderNumber)}`}
              className="btn-gold flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm"
            >
              <Truck size={15} /> Track this order
            </Link>
            <Link
              href="/"
              className="btn-outline-gold flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm"
            >
              <Home size={15} /> Continue shopping
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
