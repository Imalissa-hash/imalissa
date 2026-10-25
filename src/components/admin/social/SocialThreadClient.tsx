"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Panel, BusyBtn, TextArea, Empty } from "@/components/admin/ui";
import { formatDate, timeAgo } from "@/lib/utils";

/** One inbound message in the thread — server-serialized. */
export interface SocialThreadMessage {
  id: string;
  body: string;
  isRead: boolean;
  /** Set only when a reply was accepted by the Graph API. */
  repliedAt: string | null;
  receivedAt: string;
}

/**
 * A single Facebook conversation: every message the same person sent to the
 * Page, oldest first, with a composer underneath.
 *
 * Two things this deliberately does not pretend to do:
 *
 * 1. It never shows a reply we did not send. `repliedAt` is stamped only
 *    after Graph accepts, so a message with a null `repliedAt` renders as
 *    unanswered even if staff answered out of band on Facebook.
 * 2. It does not display reply text, because none is stored — SocialMessage
 *    holds inbound messages only. It shows WHEN a reply was accepted rather
 *    than inventing what it said.
 */
export function SocialThreadClient({
  anchorId,
  senderName,
  senderId,
  channel,
  messages,
  canSend,
}: {
  /** Any id in this thread — the reply endpoint keys off senderId anyway. */
  anchorId: string;
  senderName: string;
  senderId: string;
  channel: string;
  messages: SocialThreadMessage[];
  canSend: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unread = messages.some((m) => !m.isRead);

  /**
   * Opening a conversation reads it.
   *
   * Guarded by a ref because React 19 strict mode runs effects twice in
   * development, and each call writes its own audit row — idempotent for
   * state, noisy for the log.
   */
  const markedRef = useRef(false);
  useEffect(() => {
    if (!unread || markedRef.current) return;
    markedRef.current = true;
    void fetch(`/api/admin/social/${anchorId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversation: true }),
    })
      .then((res) => {
        if (res.ok) router.refresh();
        // A refusal must leave the badge showing — clearing it silently
        // would tell the admin a thread needs attention when it doesn't.
        else markedRef.current = false;
      })
      .catch(() => {
        markedRef.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread, anchorId]);

  const send = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/social/${anchorId}/reply`, {
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

  const pending = messages.filter((m) => !m.repliedAt).length;

  return (
    <div className="space-y-4">
      {/* ── who this is ─────────────────────────────────────────── */}
      <Panel padded>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-lg font-semibold text-mist-50">
              {senderName}
            </h3>
            <p className="mt-0.5 truncate text-[0.74rem] text-mist-600">
              {channel} · {senderId}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-wide">
            <span className="rounded-full border border-white/15 bg-white/[0.05] px-2.5 py-1 text-mist-400">
              {messages.length} msg{messages.length === 1 ? "" : "s"}
            </span>
            {pending > 0 ? (
              <span className="rounded-full border border-gold-500/30 bg-gold-500/10 px-2.5 py-1 text-gold-300">
                {pending} awaiting reply
              </span>
            ) : (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-300">
                all answered
              </span>
            )}
          </div>
        </div>
      </Panel>

      {/* ── the thread ──────────────────────────────────────────── */}
      <Panel padded>
        {messages.length === 0 ? (
          <Empty
            title="No messages in this conversation"
            hint="New messages from this person will appear here within seconds."
          />
        ) : (
          <ol className="space-y-5">
            {messages.map((m) => (
              <li key={m.id}>
                {/* The customer's own words, in arrival order. */}
                <div className="flex justify-start">
                  <div className="max-w-[min(46rem,85%)]">
                    <div className="whitespace-pre-wrap rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.05] px-4 py-3 text-[0.9rem] leading-relaxed text-mist-100">
                      {m.body}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[0.7rem] text-mist-600">
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

                {/* Our side. We know a reply WAS accepted, not what it said,
                    so we say exactly that and nothing more. */}
                {m.repliedAt && (
                  <div className="mt-3 flex justify-end">
                    <div className="text-right">
                      <div className="inline-flex items-center gap-2 rounded-2xl rounded-tr-sm border border-gold-500/30 bg-gold-500/10 px-4 py-2 text-[0.8rem] font-semibold text-gold-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        You replied
                      </div>
                      <div className="mt-1.5 text-[0.7rem] text-mist-600">
                        {formatDate(m.repliedAt, "short")}
                      </div>
                    </div>
                  </div>
                )}

                {/* The honest counterpart to the chip above. */}
                {!m.repliedAt && (
                  <div className="mt-2 text-right text-[0.7rem] text-amber-400/90">
                    not answered here
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </Panel>

      {/* ── composer ────────────────────────────────────────────── */}
      <Panel padded>
        {!canSend ? (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-[0.82rem] leading-relaxed text-amber-200">
            <strong>Read-only:</strong> this thread can be viewed, but{" "}
            <code>META_PAGE_TOKEN</code> is not set on the server, so no reply
            can be sent from here. Answer from Facebook in the meantime.
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
              <span className="text-[0.72rem] text-mist-600">
                {draft.length}/2000
              </span>
              <BusyBtn busy={sending} onClick={send} disabled={!draft.trim()}>
                Send reply
              </BusyBtn>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
