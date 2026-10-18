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
 *        inbound message. `externalId` is unique, so Meta's retries — and
 *        its habit of redelivering on a slow 200 — land as no-ops.
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

  const rows: {
    senderId: string;
    externalId: string;
    body: string;
    receivedAt: Date;
  }[] = [];

  for (const entry of payload.entry ?? []) {
    for (const msg of entry.messaging ?? []) {
      // is_echo = our own reply reflected back. Storing it would fill the
      // inbox with the shop's own words, so it is skipped.
      if (!msg.message?.text || msg.message.is_echo) continue;
      const senderId = msg.sender?.id;
      const mid = msg.message.mid;
      if (!senderId || !mid) continue;

      rows.push({
        senderId,
        externalId: mid,
        body: msg.message.text,
        // Meta stamps in epoch ms; fall back to now if absent.
        receivedAt: msg.timestamp ? new Date(msg.timestamp) : new Date(),
      });
    }
  }

  if (rows.length > 0) {
    // createMany + skipDuplicates on the unique externalId: Meta redelivers
    // aggressively, and a duplicate inbox row is worse than a dropped one.
    const created = await prisma.socialMessage.createMany({
      data: rows,
      skipDuplicates: true,
    });
    console.log(
      `[social] ${created.count} of ${rows.length} inbound message(s) stored`
    );
  }

  // 200 + empty body = "received", which stops the redelivery loop.
  return new NextResponse(null, { status: 200 });
}
