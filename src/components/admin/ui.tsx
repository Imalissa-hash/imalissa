"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Inbox, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared admin UI kit — panels, tables, modal, fields and stat cards.
 * Everything is styled with the same black/gold design tokens as the
 * storefront so the panel feels like one product.
 */

/* ── Panel ─────────────────────────────────────────────── */
export function Panel({
  title,
  subtitle,
  action,
  children,
  className,
  padded = true,
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-white/[0.08] bg-white/[0.02]",
        padded && "p-5",
        className
      )}
    >
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            {title && (
              <h2 className="font-display text-lg font-semibold text-mist-50">{title}</h2>
            )}
            {subtitle && <p className="mt-0.5 text-[0.82rem] text-mist-500">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/* ── Stat card ─────────────────────────────────────────── */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "gold",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ReactNode;
  tone?: "gold" | "success" | "danger" | "muted";
}) {
  const tones = {
    gold: "border-gold-500/25 bg-gold-500/[0.06] text-gold-400",
    success: "border-success/25 bg-success/[0.07] text-success",
    danger: "border-danger/25 bg-danger/[0.07] text-danger",
    muted: "border-white/10 bg-white/[0.03] text-mist-400",
  };
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.74rem] uppercase tracking-[0.14em] text-mist-600">{label}</p>
          <p className="mt-1.5 truncate font-display text-2xl font-bold text-mist-50">{value}</p>
          {hint && <p className="mt-0.5 text-[0.74rem] text-mist-500">{hint}</p>}
        </div>
        {icon && (
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border", tones[tone])}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Table ─────────────────────────────────────────────── */
export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[640px] border-collapse text-left text-[0.86rem]">
        {children}
      </table>
    </div>
  );
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "border-b border-white/[0.08] px-3 py-2.5 text-[0.7rem] font-bold uppercase tracking-[0.14em] text-mist-600",
        className
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  colSpan,
}: {
  children?: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn("border-b border-white/[0.05] px-3 py-3 text-mist-300 align-middle", className)}
    >
      {children}
    </td>
  );
}

export function RowLink({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("transition hover:bg-white/[0.02]", className)}>{children}</div>;
}

/* ── Empty state ───────────────────────────────────────── */
export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 px-6 py-12 text-center">
      <Inbox size={24} className="text-mist-600" />
      <p className="text-[0.92rem] text-mist-300">{title}</p>
      {hint && <p className="text-[0.8rem] text-mist-600">{hint}</p>}
    </div>
  );
}

/* ── Modal ─────────────────────────────────────────────── */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ duration: 0.22 }}
            className={cn(
              "fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-white/10 bg-ink-900 p-6 shadow-lift",
              wide ? "max-w-3xl" : "max-w-lg"
            )}
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <h3 className="font-display text-lg font-semibold text-mist-50">{title}</h3>
              <button
                onClick={onClose}
                aria-label="Close"
                className="rounded-lg p-1.5 text-mist-500 transition hover:bg-white/[0.06] hover:text-mist-200"
              >
                <X size={16} />
              </button>
            </div>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ── Fields ────────────────────────────────────────────── */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-[0.78rem] font-semibold text-mist-300">{label}</label>
      {children}
      {error ? (
        <p className="mt-1 text-[0.76rem] text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[0.74rem] text-mist-600">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn("input-premium", props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn("input-premium min-h-28", props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cn("input-premium", props.className)}>
      {props.children}
    </select>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-[0.86rem] text-mist-300">
      <input
        type="checkbox"
        className="accent-gold-500"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

/* ── Buttons ───────────────────────────────────────────── */
export function Btn({
  children,
  onClick,
  type = "button",
  variant = "gold",
  disabled,
  className,
  href,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "gold" | "outline" | "danger" | "ghost";
  disabled?: boolean;
  className?: string;
  href?: string;
}) {
  const variants = {
    gold: "btn-gold",
    outline: "border border-white/12 text-mist-300 hover:border-gold-500/40 hover:text-gold-300",
    danger: "border border-danger/40 text-danger hover:bg-danger/10",
    ghost: "text-mist-400 hover:text-mist-200",
  };
  const cls = cn(
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[0.84rem] font-semibold transition disabled:opacity-50",
    variants[variant],
    className
  );
  if (href) {
    return (
      <a href={href} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}

/* ── Search input (controlled) ─────────────────────────── */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-mist-600" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input-premium pl-9"
      />
    </div>
  );
}

/* ── Async button (busy spinner) ───────────────────────── */
export function BusyBtn({
  busy,
  children,
  onClick,
  variant = "gold",
  type = "button",
  disabled,
}: {
  busy: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "gold" | "outline" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <Btn onClick={onClick} variant={variant} type={type} disabled={busy || disabled}>
      {busy && <Loader2 size={14} className="animate-spin" />}
      {children}
    </Btn>
  );
}

/* ── Tabs ──────────────────────────────────────────────── */
export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: string; count?: number }[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "rounded-full border px-4 py-1.5 text-[0.8rem] transition",
            active === t.key
              ? "border-gold-500/50 bg-gold-500/[0.12] font-semibold text-gold-300"
              : "border-white/10 text-mist-400 hover:border-gold-500/30 hover:text-mist-200"
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className="ml-1.5 text-[0.72rem] text-mist-600">({t.count})</span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ── Confirmation dialog hook ──────────────────────────── */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="text-[0.88rem] leading-relaxed text-mist-400">{message}</p>
      <div className="mt-5 flex justify-end gap-3">
        <Btn variant="outline" onClick={onCancel}>
          Cancel
        </Btn>
        <BusyBtn busy={Boolean(busy)} onClick={onConfirm} variant="danger">
          {confirmLabel}
        </BusyBtn>
      </div>
    </Modal>
  );
}
