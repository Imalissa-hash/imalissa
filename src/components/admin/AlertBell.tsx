"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, MessageSquare, Package, ArrowRight, Play, Volume2 } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import {
  ALERT_SOUNDS,
  loadAlertSound,
  playAlertSound,
  primeAlertAudio,
  saveAlertSound,
} from "@/lib/alert-sound";

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
  const [sound, setSound] = useState<string>("chime");
  const wrapRef = useRef<HTMLDivElement>(null);
  /** This browser's sound choice (ref too, so polls never go stale). */
  const soundRef = useRef<string>("chime");
  /** Unseen count at the previous poll — a GROWTH = a new alert arrived. */
  const prevUnseenRef = useRef<number | null>(null);
  /** Ids already known, used to pick the newest arrival for the sound. */
  const knownIdsRef = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/alerts?page=1&size=8", { cache: "no-store" });
      if (!res.ok) return; // logged out / no permission — watchdog handles it
      const json = await res.json().catch(() => null);
      if (json?.ok && json.data) {
        const nextItems: AlertRow[] = Array.isArray(json.data.items) ? json.data.items : [];
        const nextUnseen = Number(json.data.unseen) || 0;

        // Sound ONLY when the unseen count grows while this page is open
        // (never on first load or a return visit): an order or message
        // just landed — announce it with the chosen sound.
        const firstLoad = knownIdsRef.current === null;
        if (!firstLoad && prevUnseenRef.current !== null && nextUnseen > prevUnseenRef.current) {
          const fresh =
            nextItems.find((row) => !knownIdsRef.current!.has(row.id)) ?? nextItems[0];
          if (fresh) playAlertSound(soundRef.current, fresh.title);
        }
        knownIdsRef.current = new Set(nextItems.map((row) => row.id));
        prevUnseenRef.current = nextUnseen;

        setItems(nextItems);
        setUnseen(nextUnseen);
      }
    } catch {
      /* transient failure — keep the last known state */
    }
  }, []);

  useEffect(() => {
    soundRef.current = loadAlertSound();
    setSound(soundRef.current);
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

  /** Pick + persist this browser's alert sound. */
  const chooseSound = (id: string) => {
    soundRef.current = id;
    setSound(id);
    saveAlertSound(id);
  };

  /** Preview the currently selected sound. */
  const testSound = () => {
    primeAlertAudio();
    playAlertSound(soundRef.current, "Test — a new order has just arrived");
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

          {/* Sound picker — synthesized/spoken right in the browser, so no
              audio files are downloaded; choice is saved per device. */}
          <div className="flex items-center justify-between gap-2 border-t border-white/[0.07] px-3.5 py-2.5">
            <label
              className="flex min-w-0 items-center gap-1.5 text-[0.74rem] text-mist-500"
              title="Sound played when a new order or message arrives while this panel is open"
            >
              <Volume2 size={12} className="shrink-0" />
              <span className="sr-only">Alert sound</span>
              <select
                value={sound}
                onChange={(e) => chooseSound(e.target.value)}
                aria-label="Alert sound"
                className="max-w-[7rem] rounded-md border border-white/10 bg-ink-950 px-1.5 py-1 text-[0.74rem] text-mist-300 outline-none transition focus:border-gold-500/40"
              >
                {ALERT_SOUNDS.map((s) => (
                  <option key={s.id} value={s.id} title={s.hint}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={testSound}
              className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[0.72rem] text-mist-400 transition hover:border-gold-500/40 hover:text-gold-300"
            >
              <Play size={10} /> Test
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
