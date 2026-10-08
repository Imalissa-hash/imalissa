"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, LogIn, MessageCircle, Send, X } from "lucide-react";

type ChatMessage = {
  id: string;
  sender: "USER" | "ADMIN" | "AUTO";
  body: string;
  createdAt: string;
};

type ChatThread = {
  id: string;
  status: "OPEN" | "CLOSED";
  createdAt: string;
  lastMessageAt: string;
};

type ChatState = {
  loggedIn: boolean;
  thread: ChatThread | null;
  messages: ChatMessage[];
};

const EMPTY: ChatState = { loggedIn: false, thread: null, messages: [] };

function timeShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Floating support-chat widget (homepage).
 *
 * Not an AI bot — a live line to the shop's staff: every message lands in
 * Admin → Live Chat and an admin answers from there. Visitors who are not
 * logged in get a "please log in" panel instead of the composer.
 */
export function SupportChat() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<ChatState>(EMPTY);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/chat", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { data?: ChatState };
      if (data.data) {
        setState(data.data);
        setError(null);
      }
    } catch {
      /* transient — the next poll retries */
    }
  }, []);

  // First open → fetch state; while open → poll for admin replies (12 s).
  useEffect(() => {
    if (!open) return;
    if (!loadedRef.current) {
      loadedRef.current = true;
      setLoading(true);
      refresh().finally(() => setLoading(false));
    }
    const t = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 12_000);
    return () => clearInterval(t);
  }, [open, refresh]);

  // Keep the conversation scrolled to the newest message.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.messages.length, open]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        data?: { thread: ChatThread; messages: ChatMessage[] };
        message?: string;
      };
      if (!res.ok) {
        if (res.status === 401) {
          setState((s) => ({ ...s, loggedIn: false }));
        } else {
          setError(data.message || "Could not send — please try again.");
        }
        return;
      }
      if (data.data) {
        setState((s) => ({
          loggedIn: true,
          thread: data.data!.thread,
          messages: data.data!.messages,
        }));
        setDraft("");
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Bubble */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close support chat" : "Open support chat"}
        className="fixed bottom-6 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full border border-gold-500/50 bg-ink-900/95 text-gold-300 shadow-lift backdrop-blur transition hover:bg-ink-850 hover:text-gold-200"
      >
        {open ? <X size={22} /> : <MessageCircle size={24} />}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-24 right-5 z-50 flex h-[26rem] w-[calc(100vw-2.5rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-900 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)]">
          <div className="flex items-center justify-between border-b border-white/10 bg-ink-950/70 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </span>
              <div>
                <p className="text-sm font-semibold text-mist-50">Imalissa Support</p>
                <p className="text-[11px] text-mist-400">
                  We usually reply within a few minutes
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Minimize chat"
              className="rounded-lg p-1.5 text-mist-400 transition hover:bg-white/5 hover:text-mist-100"
            >
              <X size={16} />
            </button>
          </div>

          {loading ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="animate-spin text-gold-400" size={24} />
            </div>
          ) : !state.loggedIn ? (
            /* ---------- login gate ---------- */
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-gold-500/30 bg-gold-500/10 text-gold-300">
                <LogIn size={22} />
              </div>
              <div className="space-y-1.5">
                <p className="font-display text-base font-semibold text-mist-50">
                  Please log in to chat
                </p>
                <p className="text-sm leading-relaxed text-mist-400">
                  So we know who we are talking to and can check your orders —
                  log in (or create a free account) and the chat opens right
                  away.
                </p>
              </div>
              <div className="flex w-full flex-col gap-2">
                <Link
                  href="/auth/login"
                  className="rounded-xl bg-gold-500 px-4 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-gold-400"
                >
                  Log in
                </Link>
                <Link
                  href="/auth/register"
                  className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-mist-200 transition hover:bg-white/5"
                >
                  Create an account
                </Link>
              </div>
            </div>
          ) : (
            <>
              {state.thread?.status === "CLOSED" && (
                <p className="border-b border-white/10 bg-white/5 px-4 py-2 text-center text-[11px] text-mist-400">
                  This conversation was closed — send a message to start a new
                  one.
                </p>
              )}

              {/* messages */}
              <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {state.messages.length === 0 && (
                  <div className="mx-auto max-w-[85%] rounded-2xl rounded-tl-sm border border-white/10 bg-white/5 px-4 py-3 text-sm leading-relaxed text-mist-300">
                    Hello! 👋 Ask us anything about products, delivery or your
                    order — our team will reply here.
                  </div>
                )}
                {state.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.sender === "USER" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                        m.sender === "USER"
                          ? "rounded-br-sm bg-gold-500 text-ink-950"
                          : m.sender === "AUTO"
                            ? "rounded-tl-sm border border-dashed border-white/15 bg-white/[0.03] text-mist-400"
                            : "rounded-tl-sm border border-white/10 bg-white/5 text-mist-100"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p
                        className={`mt-1 text-[10px] ${
                          m.sender === "USER"
                            ? "text-ink-900/60"
                            : m.sender === "AUTO"
                              ? "text-mist-600"
                              : "text-mist-500"
                        }`}
                      >
                        {m.sender === "AUTO" ? "Auto reply · " : ""}
                        {timeShort(m.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {error && (
                <p className="border-t border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-300">
                  {error}
                </p>
              )}

              {/* composer */}
              <div className="flex items-center gap-2 border-t border-white/10 bg-ink-950/60 px-3 py-3">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder="Type your message…"
                  maxLength={2000}
                  aria-label="Chat message"
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-mist-50 placeholder:text-mist-500 focus:border-gold-500/50 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={sending || !draft.trim()}
                  aria-label="Send message"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold-500 text-ink-950 transition hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {sending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
