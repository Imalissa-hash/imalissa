"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, XCircle, X } from "lucide-react";
import { useStore } from "@/components/providers/AppProviders";

const icons = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const tones = {
  success: "border-success/40 text-success",
  error: "border-danger/40 text-danger",
  info: "border-gold-500/40 text-gold-300",
};

export function Toaster() {
  const { toasts, dismissToast } = useStore();

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4 sm:top-6">
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = icons[t.type];
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              className={`pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border bg-ink-850/95 px-4 py-3 shadow-lift backdrop-blur-xl ${tones[t.type]}`}
            >
              <Icon size={18} className="shrink-0" />
              <p className="flex-1 text-sm text-mist-100">{t.message}</p>
              <button
                onClick={() => dismissToast(t.id)}
                className="text-mist-500 transition hover:text-mist-200"
                aria-label="Dismiss"
              >
                <X size={15} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
