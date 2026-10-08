"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, MessageSquare, Package, ArrowRight } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";

/**
 * Topbar alert bell: unseen count badge + dropdown with the actual
 * content of the newest System Log entries (new orders / new messages).
 * Polls every 30s and on window focus — Render free tier has no push
 * channel, so "alert" here means the badge appears as soon as the panel
 * notices a new entry.
 */

interface AlertRow {
  id: string;
  type: "ORDER" | "MESSAGE";
  title: string;
  body: string | null;
  link: string | null;
  seenAt: string | null;
  createdAt: string;
}

export function AlertBell() {
  const [items, setItems] = useState<AlertRow[]>([]);
  const [unseen, setUnseen] = useState(0);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/alerts?page=1&size=8", { cache: "no-store" });
      if (!res.ok) return; // logged out / no permission — watchdog handles it
      const json = await res.json().catch(() => null);
      if (json?.ok && json.data) {
        setItems(Array.isArray(json.data.items) ? json.data.items : []);
        setUnseen(Number(json.data.unseen) || 0);
      }
    } catch {
      /* transient failure — keep the last known state */
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={unseen > 0 ? `Alerts — ${unseen} new` : "Alerts"}
        aria-expanded={open}
        className="relative rounded-lg border border-white/10 p-2 text-mist-400 transition hover:border-gold-500/40 hover:text-gold-300"
      >
        <Bell size={15} />
        {unseen > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-gold-500 px-1 text-[0.58rem] font-bold leading-none text-ink-950">
            {unseen > 99 ? "99+" : unseen}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[19rem] overflow-hidden rounded-xl border border-white/10 bg-ink-900 shadow-2xl shadow-black/50">
          <div className="flex items-center justify-between border-b border-white/[0.07] px-3.5 py-2.5">
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.16em] text-mist-500">
              Alerts
            </p>
            <Link
              href="/admin/alerts"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 text-[0.74rem] text-gold-400 transition hover:text-gold-300"
            >
              View all <ArrowRight size={11} />
            </Link>
          </div>

          {items.length === 0 ? (
            <p className="px-3.5 py-6 text-center text-[0.8rem] text-mist-600">
              No alerts yet — new orders and messages will appear here.
            </p>
          ) : (
            <ul className="max-h-[22rem] overflow-y-auto">
              {items.map((row) => (
                <li key={row.id}>
                  <Link
                    href={row.link || "/admin/alerts"}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex gap-2.5 border-b border-white/[0.05] px-3.5 py-2.5 transition hover:bg-white/[0.04]",
                      !row.seenAt && "bg-gold-500/[0.05]"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border",
                        row.type === "ORDER"
                          ? "border-gold-500/30 bg-gold-500/10 text-gold-400"
                          : "border-sky-500/30 bg-sky-500/10 text-sky-400"
                      )}
                    >
                      {row.type === "ORDER" ? <Package size={12} /> : <MessageSquare size={12} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[0.8rem] font-semibold text-mist-100">
                          {row.title}
                        </span>
                        {!row.seenAt && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400" />
                        )}
                      </span>
                      {row.body && (
                        <span className="mt-0.5 block whitespace-pre-wrap break-words text-[0.74rem] leading-snug text-mist-500 line-clamp-2">
                          {row.body}
                        </span>
                      )}
                      <span className="mt-1 block text-[0.68rem] text-mist-600">
                        {timeAgo(row.createdAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
