"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Panel,
  Table,
  Th,
  Td,
  Empty,
  SearchInput,
  Tabs,
  Btn,
  BusyBtn,
  TextInput,
  TextArea,
  Modal,
} from "@/components/admin/ui";
import { Pagination } from "@/components/ui/Pagination";
import { cn, formatDate, timeAgo } from "@/lib/utils";

/** One Facebook message row — server-serialized. */
export interface SocialRow {
  id: string;
  channel: string;
  senderId: string;
  senderName: string | null;
  body: string;
  isRead: boolean;
  /** Set only when a reply was accepted by the Graph API. */
  repliedAt: string | null;
  receivedAt: string;
}

export interface SocialCounts {
  unread: number;
  replied: number;
  total: number;
}

const BOXES = [
  { key: "unread", label: "Unread" },
  { key: "replied", label: "Replied" },
  { key: "all", label: "All" },
];

export function SocialClient({
  items,
  total,
  totalPages,
  page,
  searchParams,
  counts,
  connected,
  canSend,
  missing,
  verifyToken,
  pageId,
  webhookPath,
}: {
  items: SocialRow[];
  total: number;
  totalPages: number;
  page: number;
  searchParams: Record<string, string | string[] | undefined>;
  counts: SocialCounts;
  connected: boolean;
  canSend: boolean;
  /** .env names still absent — drives the exact "add this line" copy. */
  missing: string[];
  verifyToken: string;
  pageId: string;
  webhookPath: string;
}) {
  const router = useRouter();
  const get = (k: string) => {
    const v = searchParams[k];
    return typeof v === "string" ? v : "";
  };

  const box = get("box");
  const urlQ = get("q");
  const [q, setQ] = useState(urlQ);

  // Reply composer. `replying` holds the row being answered; the draft is
  // kept separate so closing the modal never loses text mid-thought.
  const [replying, setReplying] = useState<SocialRow | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

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
    router.push(`/admin/social${qs ? `?${qs}` : ""}`);
  };

  useEffect(() => {
    const t = setTimeout(() => {
      const next = q.trim();
      if (next !== urlQ) push({ q: next || null });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const countFor = (key: string) =>
    key === "unread" ? counts.unread : key === "replied" ? counts.replied : counts.total;

  /**
   * Send a real reply through Messenger. The row is only marked "Replied"
   * after Facebook ACCEPTS the message — if Graph refuses, the error stays on
   * screen and the customer is visibly still waiting, which is the honest
   * state. Optimistically ticking the badge would hide a message nobody
   * answered.
   */
  const sendReply = async () => {
    if (!replying || !draft.trim() || sending) return;
    setSending(true);
    setReplyError(null);
    try {
      const res = await fetch(`/api/admin/social/${replying.id}/reply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: draft.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        ok?: boolean;
      };
      if (!res.ok) {
        setReplyError(data.message || "Facebook did not accept the reply.");
        return;
      }
      setReplying(null);
      setDraft("");
      router.refresh();
    } catch {
      setReplyError("Network error — please try again.");
    } finally {
      setSending(false);
    }
  };

  /* ── not connected: say exactly what is missing, never pretend ──── */
  if (!connected) {
    return (
      <Panel padded>
        <div className="max-w-3xl">
          <h3 className="font-display text-lg font-semibold text-mist-50">
            Facebook Page messages are not connected yet
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-mist-400">
            This inbox receives messages sent to your Facebook Page and lets you
            reply from here. Nothing has been wired up yet, so there is nothing
            to show — and no message is being missed by this screen, because
            Facebook is not sending to it at all.
          </p>

          <ol className="mt-6 space-y-5">
            <Step n={1} title="Put the app secret in .env">
              <p>
                In your Meta app, open <em>Settings → Basic</em> and copy the{" "}
                <strong>App Secret</strong>. Add it to the server&apos;s{" "}
                <code>.env</code>, then redeploy:
              </p>
              <Code lines={[`META_APP_SECRET=…`]} />
              <p className="mt-2 text-[0.78rem] text-mist-500">
                This is what lets the server prove a webhook really came from
                Meta. Without it every POST is refused.
              </p>
            </Step>

            <Step n={2} title="Set the webhook callback in Meta">
              <p>
                In <em>App → Webhooks</em>, subscribe to the{" "}
                <strong>Page</strong> object for the <code>messages</code>{" "}
                field, and use this callback URL:
              </p>
              <Code lines={[`https://imalissa.onrender.com${webhookPath}`]} />
            </Step>

            <Step n={3} title="Match the verify token">
              <p>
                Meta will ask for a verify token. Save one below first, then
                paste the same value into the Webhook&apos;s{" "}
                <strong>Verify token</strong> box in Meta:
              </p>
              <VerifyTokenForm current={verifyToken} />
            </Step>

            <Step n={4} title="Add a Page Access Token to reply">
              <p>
                Reading messages needs no token, but <em>answering</em> them
                does. Create a token with <code>pages_messaging</code> in{" "}
                <em>App → Tools → Access Token Generator</em> and add:
              </p>
              <Code lines={[`META_PAGE_TOKEN=…`]} />
              <p className="mt-2 text-[0.78rem] text-mist-500">
                Until this line exists you can still <strong>read</strong>{" "}
                messages here once steps 1–3 are done — you just cannot send a
                reply from this screen.
              </p>
            </Step>
          </ol>

          <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-[0.8rem] text-mist-400">
            <strong className="text-mist-200">Missing right now:</strong>{" "}
            {missing.length > 0 ? (
              <code className="text-gold-300">{missing.join(", ")}</code>
            ) : (
              <span>nothing — the .env side looks complete.</span>
            )}
            <p className="mt-1.5 text-[0.76rem] text-mist-500">
              Page Access Tokens expire. When a reply starts failing, generate a
              new one and replace the line.
            </p>
          </div>
        </div>
      </Panel>
    );
  }

  const hasFilters = Boolean(urlQ || box !== "unread");

  return (
    <div>
      {!canSend && (
        <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-[0.82rem] leading-relaxed text-amber-200">
          <strong>Read-only:</strong> messages arrive here, but{" "}
          <code>META_PAGE_TOKEN</code> is not set, so replies cannot be sent
          from this screen. Answer from Facebook in the meantime.
        </div>
      )}

      <Panel padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] p-5">
          <Tabs
            tabs={BOXES.map((b) => ({ key: b.key, label: b.label, count: countFor(b.key) }))}
            active={box}
            onChange={(key) => push({ box: key || "unread" })}
          />
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder="Search name or message…"
            className="w-full sm:w-72"
          />
        </div>

        {items.length === 0 ? (
          <div className="p-5">
            <Empty
              title={hasFilters ? "No messages match your filters" : "No unread messages"}
              hint={
                hasFilters
                  ? "Try a different search term, or switch tabs above."
                  : "New messages from your Facebook Page appear here within seconds."
              }
            />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>From</Th>
                <Th>Message</Th>
                <Th>Received</Th>
                <Th>State</Th>
                <Th className="text-right">Action</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id} className="transition hover:bg-white/[0.03]">
                  <Td>
                    <div className="min-w-0">
                      <span
                        className={cn(
                          "block truncate",
                          m.isRead ? "font-semibold text-mist-300" : "font-bold text-mist-50"
                        )}
                      >
                        {m.senderName ?? "Facebook sender"}
                      </span>
                      <span className="block truncate text-[0.72rem] text-mist-600">
                        {m.senderId}
                      </span>
                    </div>
                  </Td>
                  <Td>
                    <span
                      className={cn(
                        "block",
                        m.isRead ? "text-mist-400" : "font-semibold text-gold-200"
                      )}
                    >
                      {m.isRead && (
                        <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-gold-400 align-middle" />
                      )}
                      {m.body}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap">
                    <span className="block text-mist-300">
                      {formatDate(m.receivedAt, "short")}
                    </span>
                    <span className="block text-[0.72rem] text-mist-600">
                      {timeAgo(m.receivedAt)}
                    </span>
                  </Td>
                  <Td>
                    <span
                      className={cn(
                        "inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-wide",
                        m.repliedAt
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                          : m.isRead
                            ? "border-white/15 bg-white/[0.05] text-mist-400"
                            : "border-gold-500/30 bg-gold-500/10 text-gold-300"
                      )}
                    >
                      {m.repliedAt ? "Replied" : m.isRead ? "Read" : "Unread"}
                    </span>
                  </Td>
                  <Td className="text-right">
                    {canSend ? (
                      <Btn
                        variant={m.repliedAt ? "outline" : "gold"}
                        onClick={() => {
                          setReplying(m);
                          setDraft("");
                          setReplyError(null);
                        }}
                      >
                        {m.repliedAt ? "Reply again" : "Reply"}
                      </Btn>
                    ) : (
                      <span className="text-[0.74rem] text-mist-600" title="META_PAGE_TOKEN is not set on the server">
                        Read-only
                      </span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      <Pagination
        page={page}
        totalPages={totalPages}
        basePath="/admin/social"
        searchParams={searchParams}
      />

      <Modal
        open={Boolean(replying)}
        onClose={() => {
          if (sending) return; // don't lose a reply mid-flight
          setReplying(null);
          setReplyError(null);
        }}
        title={`Reply to ${replying?.senderName ?? "Facebook sender"}`}
      >
        <div className="space-y-3">
          {/* The customer's own words, so the answer is written in context. */}
          <blockquote className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[0.84rem] leading-relaxed text-mist-300">
            {replying?.body}
          </blockquote>

          <TextArea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type your reply…"
            rows={5}
            maxLength={2000}
          />

          {replyError && (
            <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[0.8rem] leading-relaxed text-red-300">
              {replyError}
            </p>
          )}

          <div className="flex items-center justify-between gap-3">
            <span className="text-[0.72rem] text-mist-600">
              {draft.length}/2000
            </span>
            <div className="flex gap-3">
              <Btn variant="outline" onClick={() => setReplying(null)} disabled={sending}>
                Cancel
              </Btn>
              <BusyBtn busy={sending} onClick={sendReply} disabled={!draft.trim()}>
                Send reply
              </BusyBtn>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ── setup-guide primitives ──────────────────────────────────────── */

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-gold-500/30 bg-gold-500/10 text-[0.74rem] font-bold text-gold-300">
        {n}
      </span>
      <div className="min-w-0 text-sm leading-relaxed text-mist-400">
        <p className="font-semibold text-mist-100">{title}</p>
        <div className="mt-1.5">{children}</div>
      </div>
    </li>
  );
}

/** Monospace block with a copy button — values here are never secret. */
function Code({ lines }: { lines: string[] }) {
  const [copied, setCopied] = useState(false);
  const text = lines.join("\n");
  return (
    <div className="mt-2 flex items-start gap-2">
      <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-white/10 bg-ink-950/70 p-3 text-[0.78rem] leading-relaxed text-gold-200">
        {text}
      </pre>
      <Btn
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard blocked — the value is on screen anyway */
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </Btn>
    </div>
  );
}

/**
 * Lets the owner mint the verify token without leaving the page. It is not a
 * secret in the same class as the app secret — but it is still generated
 * server-side-looking (crypto-random) rather than a word a bot would guess.
 */
function VerifyTokenForm({ current }: { current: string }) {
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/social/verify-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ verifyToken: value }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setMsg(data.message || "Could not save — please try again.");
        return;
      }
      setMsg("Saved. Now paste this exact value into Meta's verify token box.");
      router.refresh();
    } catch {
      setMsg("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <TextInput
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. imalissa-verify-9f2c…"
          className="w-full sm:w-80"
        />
        <Btn
          variant="outline"
          onClick={() => setValue(`imalissa-${cryptoRandom()}`)}
        >
          Generate
        </Btn>
        <BusyBtn busy={busy} onClick={save} disabled={!value.trim()}>
          Save
        </BusyBtn>
      </div>
      {msg && <p className="text-[0.78rem] text-mist-500">{msg}</p>}
    </div>
  );
}

/** 12 hex chars from the browser CSPRNG — enough that guessing is hopeless. */
function cryptoRandom(): string {
  const bytes = new Uint8Array(6);
  // crypto.getRandomValues is available in every browser that runs React 19.
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
