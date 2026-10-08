"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Check, CheckCircle2, MessageSquare, Package, ArrowRight } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { loadAlertSound, playAlertSound, primeAlertAudio } from "@/lib/alert-sound";
import { AlertSoundSettings } from "@/components/admin/AlertSoundSettings";

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
  seenByName: string | null;
  createdAt: string;
}

export function AlertBell() {
  const [items, setItems] = useState<AlertRow[]>([]);
  const [unseen, setUnseen] = useState(0);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  /** Ids already known — a brand-new id means an alert just arrived. */
  const knownIdsRef = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/alerts?page=1&size=8", { cache: "no-store" });
      if (!res.ok) return; // logged out / no permission — watchdog handles it
      const json = await res.json().catch(() => null);
      if (json?.ok && json.data) {
        const nextItems: AlertRow[] = Array.isArray(json.data.items) ? json.data.items : [];
        const nextUnseen = Number(json.data.unseen) || 0;
        const soundId = loadAlertSound(); // always the device's current choice

        // Sound rules:
        // • first load of this browser session with alerts already waiting
        //   → announce ONCE ("You have 3 new alerts") — refreshes don't repeat
        // • any later poll/focus revealing a brand-new id → an order or
        //   message just landed → announce it with its actual title
        const firstLoad = knownIdsRef.current === null;
        if (firstLoad) {
          let announced = false;
          try {
            announced = Boolean(sessionStorage.getItem("imalissa.alertAnnounced"));
          } catch {
            /* storage blocked — announcing once per load is still correct enough */
          }
          if (nextUnseen > 0 && !announced) {
            playAlertSound(soundId, `You have ${nextUnseen} new alerts`);
            try {
              sessionStorage.setItem("imalissa.alertAnnounced", "1");
            } catch {
              /* ignore */
            }
          }
        } else {
          const fresh = nextItems.filter((row) => !knownIdsRef.current!.has(row.id));
          if (fresh.length > 0) playAlertSound(soundId, fresh[0].title);
        }
        knownIdsRef.current = new Set(nextItems.map((row) => row.id));

        setItems(nextItems);
        setUnseen(nextUnseen);
      }
    } catch {
      /* transient failure — keep the last known state */
    }
  }, []);

  useEffect(() => {
    primeAlertAudio(); // resume audio on the first click/keypress
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

  /** Mark one alert seen from the dropdown (stays open, badge updates). */
  const markSeen = async (row: AlertRow) => {
    if (row.seenAt) return;
    try {
      const res = await fetch(`/api/admin/alerts/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seen" }),
      });
      const json = await res.json().catch(() => null);
      if (json?.ok && json.data) {
        setItems((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? { ...r, seenAt: json.data.seenAt, seenByName: json.data.seenByName }
              : r
          )
        );
        setUnseen((u) => Math.max(0, u - 1));
      }
    } catch {
      /* transient failure — the System Log page still has the button */
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => {
          primeAlertAudio(); // this click unlocks audio for later alerts
          setOpen((o) => !o);
        }}
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
                <li
                  key={row.id}
                  className={cn(
                    "flex items-start gap-1.5 border-b border-white/[0.05] px-3.5 py-2.5 transition hover:bg-white/[0.04]",
                    !row.seenAt && "bg-gold-500/[0.05]"
                  )}
                >
                  <Link
                    href={row.link || "/admin/alerts"}
                    onClick={() => setOpen(false)}
                    className="flex min-w-0 flex-1 gap-2.5"
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

                  {/* Side Seen button — marks this alert seen right here;
                      once done it becomes a green check with the name. */}
                  {row.seenAt ? (
                    <span
                      title={`Seen by ${row.seenByName ?? "someone"}`}
                      className="mt-0.5 flex h-6 shrink-0 items-center justify-center text-emerald-400/90"
                    >
                      <CheckCircle2 size={14} />
                    </span>
                  ) : (
                    <button
                      onClick={() => markSeen(row)}
                      aria-label={`Mark as seen: ${row.title}`}
                      className="mt-0.5 h-6 shrink-0 rounded-md border border-gold-500/30 bg-gold-500/10 px-2 text-[0.66rem] font-semibold uppercase tracking-wide text-gold-300 transition hover:border-gold-400 hover:bg-gold-500/20"
                    >
                      Seen
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <AlertSoundSettings inline />
        </div>
      )}
    </div>
  );
}
