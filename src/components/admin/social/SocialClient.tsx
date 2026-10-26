"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Panel, Empty, SearchInput, Tabs, BusyBtn, TextArea } from "@/components/admin/ui";
import { Pagination } from "@/components/ui/Pagination";
import { cn, formatDate, timeAgo } from "@/lib/utils";
import { QUICK_REPLIES } from "./quick-replies";
import type { ConversationRow, ThreadMessage, InboxCounts } from "./types";

/**
 * The Social Inbox as a three-pane messenger: conversations on the left, the
 * selected thread in the middle, who-you-are-talking-to plus canned replies
 * on the right.
 *
 * Every conversation is a deep link (/admin/social/[id]) rather than local
 * state, so a thread can be bookmarked, shared with a colleague, or reloaded
 * without losing position — and the same URL renders on both routes, which is
 * why this one component serves /admin/social and /admin/social/[id] alike.
 *
 * Both directions render: INBOUND is the customer on the left, OUTBOUND is
 * the Page on the right. Nothing here invents a message that was not stored —
 * if a reply never made it into the database, it does not appear, because a
 * thread that silently omits the shop's own answer is worse than one that
 * admits it does not have it.
 */
const BOXES = [
  { key: "unread", label: "Unread" },
  { key: "replied", label: "Replied" },
  { key: "all", label: "All" },
];

export function SocialClient({
  items,
  counts,
  total,
  totalPages,
  page,
  searchParams,
  connected,
  canSend,
  missing,
  verifyToken,
  pageId,
  webhookPath,
  selectedId,
  thread,
  sender,
}: {
  items: ConversationRow[];
  counts: InboxCounts;
  total: number;
  totalPages: number;
  page: number;
  searchParams: Record<string, string | string[] | undefined>;
  connected: boolean;
  canSend: boolean;
  /** .env names still absent — drives the exact "add this line" copy. */
  missing: string[];
  verifyToken: string;
  pageId: string;
  webhookPath: string;
  selectedId: string | null;
  thread: ThreadMessage[] | null;
  sender: { name: string; id: string; channel: string } | null;
}) {
  const router = useRouter();
  const get = (k: string) => {
    const v = searchParams[k];
    return typeof v === "string" ? v : "";
  };

  const box = get("box");
  const urlQ = get("q");
  const [q, setQ] = useState(urlQ);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Rebuild the URL, keeping whichever pane is open so filtering never throws
   * away the conversation being read.
   */
  const push = (patch: Record<string, string | null>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (typeof v === "string") sp.set(k, v);
      else if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
    }
    sp.delete("page");
    for (const [k, v] of Object.entries(patch)) {
      if (!v) sp.delete(k);
      else sp.set(k, v);
    }
    const qs = sp.toString();
    const base = selectedId ? `/admin/social/${selectedId}` : "/admin/social";
    router.push(`${base}${qs ? `?${qs}` : ""}`);
  };

  useEffect(() => {
    const t = setTimeout(() => {
      const next = q.trim();
      if (next !== urlQ) push({ q: next || null });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const unread = thread?.some((m) => !m.isRead) ?? false;

  /**
   * Opening a conversation reads it.
   *
   * Guarded by a ref because React 19 strict mode runs effects twice in
   * development, and each call writes its own audit row — idempotent for
   * state, noisy for the log. A refusal leaves the badge showing: clearing it
   * silently would claim a thread needs no attention when we never proved it.
   */
  const markedRef = useRef(false);
  useEffect(() => {
    if (!selectedId || !unread || markedRef.current) return;
    markedRef.current = true;
    void fetch(`/api/admin/social/${selectedId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversation: true }),
    })
      .then((res) => {
        if (res.ok) router.refresh();
        else markedRef.current = false;
      })
      .catch(() => {
        markedRef.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, unread]);

  /**
   * Send a real reply through Messenger. The row is only marked "Replied"
   * after Facebook ACCEPTS the message — if Graph refuses the error stays on
   * screen and the customer is visibly still waiting, which is the honest
   * state. Optimistically ticking the badge would hide a message nobody
   * answered.
   */
  const send = async () => {
    if (!selectedId || !draft.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/social/${selectedId}/reply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: draft.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setError(data.message || "Facebook did not accept the reply.");
        return;
      }
      setDraft("");
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSending(false);
    }
  };

  /**
   * Canned replies fill the composer and nothing more. They are never sent on
   * a click: the admin still reads what a template wrote and edits the parts
   * that are wrong for this customer before it goes out.
   */
  const insertQuick = (text: string) =>
    setDraft((d) => (d.trim() ? `${d.replace(/\s+$/, "")}\n${text}` : text));

  const countFor = (key: string) =>
    key === "unread" ? counts.unread : key === "replied" ? counts.replied : counts.total;

  const inbound = thread?.filter((m) => m.direction === "INBOUND").length ?? 0;
  const outbound = thread?.filter((m) => m.direction === "OUTBOUND").length ?? 0;

  return (
    <div className="space-y-4">
      {/* ── connection state — never claim a link that cannot work ─── */}
      {!connected && (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-4">
          <p className="text-[0.85rem] font-semibold text-amber-200">
            Facebook is not connected yet
          </p>
          <p className="mt-1 text-[0.8rem] leading-relaxed text-amber-100/80">
            Messages will not arrive until{" "}
            <code className="rounded bg-black/30 px-1 py-0.5">
              {missing.join(", ") || "the required .env values"}
            </code>{" "}
            {missing.length === 1 ? "is" : "are"} set on the server.
          </p>
        </div>
      )}
      {connected && !canSend && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-[0.8rem] leading-relaxed text-mist-400">
          Reading works; sending does not — <code>META_PAGE_TOKEN</code> is missing, so replies
          stay read-only.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[290px_minmax(0,1fr)] xl:grid-cols-[290px_minmax(0,1fr)_270px]">
        {/* ── pane 1: conversations ─────────────────────────────────── */}
        <div className="min-w-0 space-y-3">
          <Panel padded className="space-y-3">
            <SearchInput
              value={q}
              onChange={setQ}
              placeholder="Search name, id or message…"
            />
            <Tabs
              tabs={BOXES.map((b) => ({ ...b, count: countFor(b.key) }))}
              active={box || "unread"}
              onChange={(k) => push({ box: k })}
            />

            {items.length === 0 ? (
              <Empty
                title={total === 0 ? "No conversations yet" : "Nothing in this box"}
                hint={
                  total === 0
                    ? "Message your Facebook Page and it will appear here within seconds."
                    : "Try another tab."
                }
              />
            ) : (
              <ul className="space-y-2">
                {items.map((c) => (
                  <li key={`${c.channel}-${c.senderId}`}>
                    <Link
                      href={`/admin/social/${c.id}${
                        (() => {
                          const sp = new URLSearchParams();
                          for (const [k, v] of Object.entries(searchParams)) {
                            if (typeof v === "string") sp.set(k, v);
                            else if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
                          }
                          const qs = sp.toString();
                          return qs ? `?${qs}` : "";
                        })()
                      }`}
                      className={cn(
                        "block rounded-xl border p-3 transition",
                        selectedId === c.id
                          ? "border-gold-500/45 bg-gold-500/[0.10]"
                          : "border-white/[0.06] hover:border-white/20 hover:bg-white/[0.03]"
                      )}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className={cn(
                            "truncate",
                            c.unread
                              ? "text-[0.86rem] font-bold text-mist-50"
                              : "text-[0.86rem] font-semibold text-mist-300"
                          )}
                        >
                          {c.senderName ?? "Facebook sender"}
                        </span>
                        <span className="shrink-0 text-[0.66rem] text-mist-600">
                          {timeAgo(c.receivedAt)}
                        </span>
                      </div>

                      <p className="mt-1 truncate text-[0.76rem] text-mist-500">{c.preview}</p>

                      <div className="mt-1.5 flex items-center gap-2 text-[0.66rem]">
                        <span className="truncate text-mist-600">{c.senderId}</span>
                        {c.unread && (
                          <span className="shrink-0 rounded-full bg-gold-500/15 px-1.5 py-0.5 font-semibold text-gold-300">
                            new
                          </span>
                        )}
                        {c.hasReply && (
                          <span className="shrink-0 text-emerald-400/90">replied</span>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Pagination
            page={page}
            totalPages={totalPages}
            basePath="/admin/social"
            searchParams={searchParams}
          />
        </div>

        {/* ── pane 2: the thread ────────────────────────────────────── */}
        <div className="min-w-0">
          {!selectedId ? (
            <Panel padded>
              <Empty
                title="Select a conversation"
                hint="Pick someone on the left to read and reply to their messages."
              />
            </Panel>
          ) : !thread ? (
            <Panel padded>
              <Empty title="Conversation not found" hint="It may have been removed." />
            </Panel>
          ) : (
            <Panel padded className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-3">
                <div className="min-w-0">
                  <h3 className="truncate font-display text-lg font-semibold text-mist-50">
                    {sender?.name ?? "Facebook sender"}
                  </h3>
                  <p className="mt-0.5 truncate text-[0.72rem] text-mist-600">
                    {sender?.channel} · {sender?.id}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2 text-[0.68rem] font-semibold uppercase tracking-wide">
                  <span className="rounded-full border border-white/15 bg-white/[0.05] px-2.5 py-1 text-mist-400">
                    {inbound} in · {outbound} out
                  </span>
                </div>
              </div>

              <ol className="max-h-[54vh] space-y-4 overflow-y-auto pr-1">
                {thread.map((m) => (
                  <li key={m.id}>
                    {m.direction === "OUTBOUND" ? (
                      /* The shop's own words. Right-aligned and labelled, so a
                         colleague can tell at a glance who said what. */
                      <div className="flex justify-end">
                        <div className="max-w-[85%] text-right">
                          <div className="whitespace-pre-wrap rounded-2xl rounded-tr-sm border border-gold-500/30 bg-gold-500/[0.10] px-4 py-2.5 text-left text-[0.88rem] leading-relaxed text-gold-100">
                            {m.body}
                          </div>
                          <div className="mt-1 text-[0.68rem] text-mist-600">
                            You · {formatDate(m.receivedAt, "short")}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-start">
                        <div className="max-w-[85%]">
                          <div className="whitespace-pre-wrap rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.05] px-4 py-2.5 text-[0.88rem] leading-relaxed text-mist-100">
                            {m.body}
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-[0.68rem] text-mist-600">
                            <span title={formatDate(m.receivedAt, "short")}>
                              {timeAgo(m.receivedAt)}
                            </span>
                            {!m.isRead && (
                              <span className="font-semibold uppercase tracking-wide text-gold-300">
                                unread
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ol>

              {/* ── composer ─────────────────────────────────────── */}
              {!canSend ? (
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-[0.82rem] leading-relaxed text-amber-200">
                  <strong>Read-only:</strong> this conversation can be viewed, but{" "}
                  <code>META_PAGE_TOKEN</code> is not set on the server, so no reply can be sent
                  from here.
                </div>
              ) : (
                <div className="space-y-3">
                  <TextArea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Type your reply…"
                    rows={4}
                    maxLength={2000}
                  />
                  {error && (
                    <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[0.8rem] leading-relaxed text-red-300">
                      {error}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[0.72rem] text-mist-600">{draft.length}/2000</span>
                    <BusyBtn busy={sending} onClick={send} disabled={!draft.trim()}>
                      Send reply
                    </BusyBtn>
                  </div>
                </div>
              )}
            </Panel>
          )}
        </div>

        {/* ── pane 3: who this is + canned replies ──────────────────── */}
        <div className="min-w-0 space-y-4">
          <Panel padded className="space-y-3">
            <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-mist-600">
              Customer
            </p>
            {sender ? (
              <dl className="space-y-2 text-[0.8rem]">
                <div>
                  <dt className="text-[0.68rem] uppercase tracking-wide text-mist-600">Name</dt>
                  <dd className="font-semibold text-mist-200">{sender.name}</dd>
                </div>
                <div>
                  <dt className="text-[0.68rem] uppercase tracking-wide text-mist-600">
                    Sender ID
                  </dt>
                  <dd className="break-all font-mono text-[0.76rem] text-mist-300">
                    {sender.id}
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.68rem] uppercase tracking-wide text-mist-600">
                    Channel
                  </dt>
                  <dd className="text-mist-300">{sender.channel}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-[0.8rem] text-mist-500">Select a conversation first.</p>
            )}
          </Panel>

          <Panel padded className="space-y-3">
            <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-mist-600">
              Quick replies
            </p>
            {!canSend ? (
              <p className="text-[0.78rem] leading-relaxed text-mist-500">
                Unavailable while replies are read-only.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {QUICK_REPLIES.map((qr) => (
                  <button
                    key={qr.label}
                    type="button"
                    disabled={!selectedId}
                    onClick={() => insertQuick(qr.text)}
                    className="rounded-lg border border-white/[0.08] px-3 py-2 text-left text-[0.8rem] text-mist-300 transition hover:border-gold-500/40 hover:text-gold-200 disabled:opacity-40"
                    title={qr.text}
                  >
                    {qr.label}
                  </button>
                ))}
              </div>
            )}
            <p className="text-[0.7rem] leading-relaxed text-mist-600">
              Inserts into the box — nothing sends until you press Send.
            </p>
          </Panel>

          {/* Setup values are non-secret and the admin needs them to finish
              wiring Meta, so they are shown here rather than hidden. */}
          <Panel padded className="space-y-2 text-[0.74rem]">
            <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-mist-600">
              Webhook
            </p>
            <p className="break-all text-mist-400">
              <span className="text-mist-600">callback </span>
              {webhookPath}
            </p>
            <p className="break-all text-mist-400">
              <span className="text-mist-600">verify token </span>
              {verifyToken || "—"}
            </p>
            <p className="break-all text-mist-400">
              <span className="text-mist-600">page id </span>
              {pageId || "—"}
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
