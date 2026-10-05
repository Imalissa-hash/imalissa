"use client";

import { Printer } from "lucide-react";

/** Opens the browser print dialog (order invoice print-friendly). */
export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-[0.82rem] text-mist-300 transition hover:border-gold-500/40 hover:text-gold-300"
    >
      <Printer size={14} /> {label}
    </button>
  );
}
