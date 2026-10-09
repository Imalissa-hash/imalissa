"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Inbox,
  Loader2,
  Lock,
  LockOpen,
  RefreshCcw,
  Send,
} from "lucide-react";
import { cn, formatDate, timeAgo } from "@/lib/utils";

type ThreadRow = {
  id: string;
  status: "OPEN" | "CLOSED";
  userName: string;
  phone: string | null;
  email: string | null;
  lastBody: string | null;
  lastSender: "USER" | "ADMIN" | "AUTO" | null;
  lastAt: string;
  unread: number;
  createdAt: string;
};

type ConvMessage = {
  id: string;
  sender: "USER" | "ADMIN" | "AUTO";
  body: string;
  imageUrl?: string | null;
  readAt: boolean;
  createdAt: string;
};

type Conversation = {
  thread: {
    id: string;
    status: "OPEN" | "CLOSED";
    createdAt: string;
    lastMessageAt: string;
    user: { id: string; name: string; phone: string | null; email: string | null };
  };
  messages: ConvMessage[];
  unread: number;
};

type Filter = "ALL" | "OPEN" | "CLOSED";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    data?: T;
    message?: string;
  };
  if (!res.ok || !json.ok) throw new Error(json.message || "Request failed");
  return json.data as T;
}

/**
 * Admin Live Chat: thread list on the left, the conversation on the right.
 * Polls while open so the customer's messages arrive without a refresh;
 * opening (and staying on) a conversation marks the customer's messages
 * read, which clears its unread badge for everyone.
 */
export function ChatsClient() {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [rows, setRows] = useState<ThreadRow[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [conv, setConv] = useState<Conversation | null>(null);
  const [convLoading, setConvLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sendLock = useRef(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const loadThreads = useCallback(async (f: Filter) => {
    try {
      const data = await api<{
        items: ThreadRow[];
        total: number;
        openCount: number;
      }>(`/api/admin/chats?status=${f}&page=1&size=20`);
      setRows(data.items);
      setTotal(data.total);
      setOpenCount(data.openCount);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load conversations");
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadConv = useCallback(
    async (id: string, opts?: { markRead?: boolean }) => {
      try {
        const data = await api<Conversation>(`/api/admin/chats/${id}`);
        setConv(data);
        if (data.unread > 0 && opts?.markRead !== false) {
          await api(`/api/admin/chats/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ action: "read" }),
          });
          setConv({ ...data, unread: 0 });
          setRows((rs) =>
            rs.map((r) => (r.id === id ? { ...r, unread: 0 } : r))
          );
        }
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load conversation");
      } finally {
        setConvLoading(false);
      }
    },
    []
  );

  // Initial load + poll (threads every 15 s, open conversation every 10 s).
  useEffect(() => {
    void loadThreads(filter);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void loadThreads(filter);
    }, 15_000);
    return () => clearInterval(t);
  }, [filter, loadThreads]);

  useEffect(() => {
    if (!selectedId) return;
    setConvLoading(true);
    setDraft("");
    void loadConv(selectedId);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void loadConv(selectedId);
    }, 10_000);
    return () => clearInterval(t);
  }, [selectedId, loadConv]);

  // Keep the conversation scrolled to the newest message.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conv?.messages.length, selectedId]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending || sendLock.current || !selectedId) return;
    sendLock.current = true;
    setSending(true);
    setError(null);
    try {
      const msg = await api<ConvMessage>(`/api/admin/chats/${selectedId}`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      setConv((c) => (c ? { ...c, messages: [...c.messages, msg] } : c));
      setDraft("");
      void loadThreads(filter);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
      sendLock.current = false;
    }
  };

  const toggleStatus = async () => {
    if (!conv) return;
    const action = conv.thread.status === "OPEN" ? "close" : "reopen";
    try {
      const data = await api<{ status: "OPEN" | "CLOSED" }>(
        `/api/admin/chats/${conv.thread.id}`,
        { method: "PATCH", body: JSON.stringify({ action }) }
      );
      setConv({ ...conv, thread: { ...conv.thread, status: data.status } });
      void loadThreads(filter);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    }
  };

  const filters: { key: Filter; label: string }[] = [
    { key: "ALL", label: "All" },
    { key: "OPEN", label: "Open" },
    { key: "CLOSED", label: "Closed" },
  ];

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-ink-900/60">
      {error && (
        <p className="border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      <div className="flex h-[34rem] flex-col lg:flex-row">
        {/* ---------------- thread list ---------------- */}
        <div
          className={cn(
            "flex w-full flex-col border-white/10 lg:w-80 lg:border-r",
            selectedId && "hidden lg:flex"
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
            <div className="flex gap-1">
              {filters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-xs font-semibold transition",
                    filter === f.key
                      ? "bg-gold-500/15 text-gold-300"
                      : "text-mist-400 hover:bg-white/5 hover:text-mist-200"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs text-mist-500">
              <span title={`${openCount} open conversations`}>
                {openCount} open
              </span>
              <button
                type="button"
                onClick={() => void loadThreads(filter)}
                aria-label="Refresh conversations"
                className="rounded-lg p-1.5 transition hover:bg-white/5 hover:text-mist-200"
              >
                <RefreshCcw size={13} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {listLoading ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="animate-spin text-gold-400" size={22} />
              </div>
            ) : rows.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center gap-2 px-6 text-center">
                <Inbox size={26} className="text-mist-600" />
                <p className="text-sm text-mist-400">No conversations yet</p>
                <p className="text-xs text-mist-600">
                  Customers chat from the homepage widget
                </p>
              </div>
            ) : (
              rows.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={cn(
                    "flex w-full flex-col gap-1 border-b border-white/5 px-4 py-3 text-left transition hover:bg-white/[0.04]",
                    selectedId === r.id && "bg-gold-500/[0.07]"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "truncate text-sm font-semibold",
                        r.unread > 0 ? "text-mist-50" : "text-mist-300"
                      )}
                    >
                      {r.userName}
                    </span>
                    <span className="shrink-0 text-[10px] text-mist-600">
                      {timeAgo(r.lastAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-mist-500">
                      {r.lastSender === "ADMIN" ? "You: " : ""}
                      {r.lastBody ?? "(no messages)"}
                    </span>
                    {r.unread > 0 && (
                      <span className="shrink-0 rounded-full bg-gold-500 px-1.5 py-0.5 text-[10px] font-bold text-ink-950">
                        {r.unread}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        r.status === "OPEN"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-white/10 text-mist-400"
                      )}
                    >
                      {r.status}
                    </span>
                    {r.phone && (
                      <span className="truncate text-[10px] text-mist-600">
                        {r.phone}
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>

          <p className="border-t border-white/10 px-4 py-2 text-[11px] text-mist-600">
            {total} conversation{total === 1 ? "" : "s"} total
          </p>
        </div>

        {/* ---------------- conversation ---------------- */}
        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col",
            !selectedId && "hidden lg:flex"
          )}
        >
          {!selectedId ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
              <Send size={26} className="text-mist-600" />
              <p className="text-sm text-mist-400">
                Select a conversation to read and reply
              </p>
            </div>
          ) : convLoading && !conv ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="animate-spin text-gold-400" size={24} />
            </div>
          ) : conv ? (
            <>
              {/* header */}
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(null);
                      setConv(null);
                    }}
                    aria-label="Back to conversations"
                    className="rounded-lg p-1.5 text-mist-400 transition hover:bg-white/5 hover:text-mist-100 lg:hidden"
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-mist-50">
                      {conv.thread.user.name}
                    </p>
                    <p className="truncate text-xs text-mist-500">
                      {[
                        conv.thread.user.phone,
                        conv.thread.user.email,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "No contact details"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void toggleStatus()}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition",
                    conv.thread.status === "OPEN"
                      ? "border border-white/15 text-mist-300 hover:bg-white/5"
                      : "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                  )}
                  title={
                    conv.thread.status === "OPEN"
                      ? "Close this conversation"
                      : "Reopen this conversation"
                  }
                >
                  {conv.thread.status === "OPEN" ? (
                    <>
                      <Lock size={13} /> Close
                    </>
                  ) : (
                    <>
                      <LockOpen size={13} /> Reopen
                    </>
                  )}
                </button>
              </div>

              {conv.thread.status === "CLOSED" && (
                <p className="border-b border-white/10 bg-white/5 px-4 py-2 text-center text-[11px] text-mist-400">
                  Conversation closed on{" "}
                  {formatDate(conv.thread.lastMessageAt)}
                </p>
              )}

              {/* messages */}
              <div
                ref={listRef}
                className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
              >
                {conv.messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "flex",
                      m.sender === "USER" ? "justify-start" : "justify-end"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                        m.sender === "ADMIN"
                          ? "rounded-br-sm bg-gold-500 text-ink-950"
                          : m.sender === "AUTO"
                            ? "rounded-br-sm border border-dashed border-gold-500/25 bg-gold-500/[0.06] text-mist-400"
                            : "rounded-tl-sm border border-white/10 bg-white/5 text-mist-100"
                      )}
                    >
                      {m.imageUrl && (
                        <a
                          href={m.imageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mb-2 block"
                          aria-label="View photo"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={m.imageUrl}
                            alt="Chat photo"
                            className="max-h-44 rounded-xl border border-white/10 object-cover"
                          />
                        </a>
                      )}
                      {m.body !== "(photo)" && (
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      )}
                      <p
                        className={cn(
                          "mt-1 text-[10px]",
                          m.sender === "ADMIN"
                            ? "text-ink-900/60"
                            : m.sender === "AUTO"
                              ? "text-mist-600"
                              : "text-mist-500"
                        )}
                        title={formatDate(m.createdAt)}
                      >
                        {timeAgo(m.createdAt)}
                        {m.sender === "USER" &&
                          (m.readAt ? " · seen by shop" : " · not seen yet")}
                        {m.sender === "AUTO" && " · auto reply"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* composer */}
              <div className="flex items-center gap-2 border-t border-white/10 bg-ink-950/50 px-3 py-3">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder="Reply to the customer…"
                  maxLength={2000}
                  aria-label="Reply message"
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-mist-50 placeholder:text-mist-500 focus:border-gold-500/50 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={sending || !draft.trim()}
                  aria-label="Send reply"
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
          ) : null}
        </div>
      </div>
    </div>
  );
}
