import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSettingGroup } from "@/lib/settings";
import {
  canVerifySignature,
  isValidSignature,
  verifyTokenMatches,
} from "@/lib/social";

/**
 * ============================================================
 * GET/POST /api/webhooks/meta — the Facebook Page webhook
 * ============================================================
 *
 * GET  = Meta's one-time verification handshake. Meta calls it with
 *        `hub.verify_token` and `hub.challenge`; we echo the challenge back
 *        only if the token matches what Admin → Settings → Social holds.
 *        Nothing is written, and a wrong token answers 403 so Meta can tell
 *        the app is not ours.
 *
 * POST = a real inbound message. We take the RAW bytes (a parsed-and-
 *        re-serialised body would never match the signature), verify
 *        `X-Hub-Signature-256` against META_APP_SECRET, then store each
 *        message. `externalId` is unique, so Meta's retries — and its habit
 *        of redelivering on a slow 200 — land as no-ops.
 *
 * BOTH DIRECTIONS ARE STORED, deliberately:
 *
 *   INBOUND  — the customer's words (`sender.id`).
 *   OUTBOUND — anything the Page sent, which arrives as `message.is_echo`.
 *              That is the only way Meta's own auto-responses (Instant
 *              Reply) ever appear: we did not send them, so no other path
 *              could know they happened.
 *
 * The catch with OUTBOUND is that the reply route ALREADY writes our own
 * replies, so an echo of our own text would duplicate a row that exists. The
 * echo is therefore dropped when the same conversation already has the same
 * outbound text from the last few minutes. Matching on
 * `externalId` alone is not enough: the mid Meta returns from Send and the
 * mid it echoes back are not reliably the same string.
 *
 * senderId is the conversation key on OUTBOUND rows too — the customer's
 * PSID, not the page's — or the row would group into a conversation of its
 * own and disappear from the thread it belongs to.
 *
 * Always answers 200 with an empty body once accepted: Meta treats anything
 * else as a failure and redelivers forever.
 */

export const dynamic = "force-dynamic";

/** Meta sends `hub.mode`, `hub.verify_token`, `hub.challenge`. */
type Hub = {
  "hub.mode"?: string;
  "hub.verify_token"?: string;
  "hub.challenge"?: string;
};

/** One message as Meta delivers it inside `entry[].messaging[]`. */
type Messaging = {
  sender?: { id?: string };
  recipient?: { id?: string };
  message?: { mid?: string; text?: string; is_echo?: boolean };
  timestamp?: number;
};

/** A row ready to insert — direction is decided per message, not per batch. */
type Pending = {
  senderId: string;
  externalId: string;
  body: string;
  receivedAt: Date;
  direction: "INBOUND" | "OUTBOUND";
  /** Display name resolved after the payload is read; null when unknown. */
  senderName?: string | null;
};

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const mode = sp.get("hub.mode") ?? "";
  const token = sp.get("hub.verify_token");
  const challenge = sp.get("hub.challenge") ?? "";

  // Meta only subscribes when we ask for `subscribe`.
  if (mode !== "subscribe") {
    return new NextResponse("Bad mode", { status: 400 });
  }

  const settings = await getSettingGroup("social");
  if (!settings.verifyToken) {
    // Not configured: say so rather than accepting a token we never issued.
    console.warn(
      "[social] webhook verification rejected — no verify token is set in Admin → Settings → Social"
    );
    return new NextResponse("Not configured", { status: 403 });
  }

  if (!verifyTokenMatches(settings.verifyToken, token)) {
    console.warn("[social] webhook verification rejected — verify token mismatch");
    return new NextResponse("Forbidden", { status: 403 });
  }

  console.log("[social] webhook verified by Meta");
  // 200 + the challenge verbatim, as Meta's docs require.
  return new NextResponse(challenge, {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}

/**
 * Fetch a display name for a PSID.
 *
 * Meta's webhook payload carries only an opaque id — the human name has to be
 * asked for separately with the Page token. Returns null on ANY failure
 * (no token, no permission, timeout) so a name problem can never stop a
 * message being stored; the UI already falls back to showing the PSID.
 */
async function lookupSenderName(psid: string): Promise<string | null> {
  const token = process.env.META_PAGE_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(
      `https://graph.facebook.com/v26.0/${encodeURIComponent(psid)}` +
        `?fields=name&access_token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(4000) }
    );
    const data = (await res.json().catch(() => ({}))) as {
      name?: string;
      error?: unknown;
    };
    if (res.ok && typeof data.name === "string" && data.name.trim()) {
      return data.name.trim();
    }
    return null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  if (!canVerifySignature()) {
    // Without the app secret we cannot tell Meta from an impostor, so we
    // refuse rather than let anyone write rows into the admin inbox.
    console.error(
      `[social] message refused — ${process.env.META_APP_SECRET ? "app secret unset" : "META_APP_SECRET is not set in .env"}`
    );
    return NextResponse.json(
      { ok: false, message: "Webhook signing is not configured" },
      { status: 503 }
    );
  }

  // RAW bytes — the signature is computed over exactly what Meta sent.
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  const appSecret = process.env.META_APP_SECRET ?? "";

  if (!isValidSignature(rawBody, signature, appSecret)) {
    console.warn("[social] message refused — signature check failed");
    return NextResponse.json({ ok: false, message: "Bad signature" }, { status: 403 });
  }

  let payload: {
    entry?: {
      messaging?: Messaging[];
    }[];
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Signed but unparseable: still 200 so Meta stops retrying.
    console.warn("[social] signed payload was not valid JSON — ignored");
    return NextResponse.json({ ok: true, ignored: true });
  }

  const rows: Pending[] = [];

  for (const entry of payload.entry ?? []) {
    for (const msg of entry.messaging ?? []) {
      const text = msg.message?.text;
      const mid = msg.message?.mid;
      if (!text || !mid) continue;

      const receivedAt = msg.timestamp ? new Date(msg.timestamp) : new Date();

      if (msg.message?.is_echo) {
        // Page-sent. The conversation belongs to whoever RECEIVED it.
        const key = msg.recipient?.id;
        if (!key) continue;
        rows.push({ senderId: key, externalId: mid, body: text, receivedAt, direction: "OUTBOUND" });
      } else {
        const senderId = msg.sender?.id;
        if (!senderId) continue;
        rows.push({ senderId, externalId: mid, body: text, receivedAt, direction: "INBOUND" });
      }
    }
  }

  if (rows.length > 0) {
    // ── drop echoes of replies we already wrote ──────────────────
    // The reply route stores our own outbound text the moment Graph accepts
    // it; Meta then echoes that same text back. Without this the thread
    // would show the admin's answer twice.
    const outbound = rows.filter((r) => r.direction === "OUTBOUND");
    let uniqueOutbound = outbound;
    if (outbound.length > 0) {
      const senders = [...new Set(outbound.map((r) => r.senderId))];
      const bodies = [...new Set(outbound.map((r) => r.body))];
      const existing = await prisma.socialMessage.findMany({
        where: {
          direction: "OUTBOUND",
          senderId: { in: senders },
          body: { in: bodies },
          receivedAt: { gte: new Date(Date.now() - 5 * 60_000) },
        },
        select: { senderId: true, body: true },
      });
      const seen = new Set(existing.map((r) => `${r.senderId}\u0000${r.body}`));
      uniqueOutbound = outbound.filter((r) => !seen.has(`${r.senderId}\u0000${r.body}`));
      const dropped = outbound.length - uniqueOutbound.length;
      if (dropped > 0) {
        console.log(`[social] suppressed ${dropped} echo(s) of replies already stored`);
      }
    }

    const finalRows = [
      ...rows.filter((r) => r.direction === "INBOUND"),
      ...uniqueOutbound,
    ];

    // ── attach a human name to each new sender ───────────────────
    // Batched per unique PSID: one lookup per person per webhook, not one
    // per message.
    const newSenders = [
      ...new Set(finalRows.filter((r) => r.direction === "INBOUND").map((r) => r.senderId)),
    ];
    const names = new Map<string, string | null>();
    if (newSenders.length > 0) {
      await Promise.all(
        newSenders.map(async (psid) => {
          const existing = await prisma.socialMessage.findFirst({
            where: { senderId: psid, senderName: { not: null } },
            select: { senderName: true },
          });
          names.set(psid, existing?.senderName ?? (await lookupSenderName(psid)));
        })
      );
      for (const r of finalRows) {
        if (r.direction !== "INBOUND") continue;
        r.senderName = names.get(r.senderId) ?? null;
      }
    }

    // createMany + skipDuplicates on the unique externalId: Meta redelivers
    // aggressively, and a duplicate inbox row is worse than a dropped one.
    const created = await prisma.socialMessage.createMany({
      data: finalRows.map((r) => ({
        senderId: r.senderId,
        externalId: r.externalId,
        body: r.body,
        receivedAt: r.receivedAt,
        direction: r.direction,
        ...(r.senderName ? { senderName: r.senderName } : {}),
      })),
      skipDuplicates: true,
    });

    // Backfill names onto older rows for people we just identified, so the
    // conversation LIST shows a name instead of an opaque PSID. updateMany
    // cannot vary its value per row, so each sender is filled individually —
    // there are only ever a handful per webhook, and writing one name across
    // every unidentified sender would label people with each other's names.
    const named = [...names.entries()].filter(([, v]) => v) as [string, string][];
    for (const [psid, name] of named) {
      await prisma.socialMessage.updateMany({
        where: { senderId: psid, senderName: null },
        data: { senderName: name },
      });
    }

    console.log(
      `[social] ${created.count} of ${finalRows.length} message(s) stored ` +
        `(${finalRows.filter((r) => r.direction === "INBOUND").length} in, ` +
        `${finalRows.filter((r) => r.direction === "OUTBOUND").length} out)`
    );
  }

  // 200 + empty body = "received", which stops the redelivery loop.
  return new NextResponse(null, { status: 200 });
}
