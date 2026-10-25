import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { canSendReplies } from "@/lib/social";
import { audit } from "@/lib/audit";
import { notFound, badRequest } from "@/lib/errors";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const replySchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write a reply first")
    // Messenger's own per-message text ceiling is 2000 characters.
    .max(2000, "Keep the reply under 2000 characters"),
});

/**
 * POST /api/admin/social/[id]/reply — send a real reply through Messenger.
 *
 * This endpoint used to be mounted at /api/admin/social/[id] while both the
 * UI and this route's own documentation called `/reply`, so every reply from
 * the inbox 404'd. It now lives where it has always been described.
 *
 * This is an actual Graph API call, and it reports what Graph actually said.
 * A failure here is returned as a failure — never optimistically marked
 * "Replied" — because a customer left waiting on a message the shop thinks
 * it sent is worse than an error on screen.
 *
 * `repliedAt` is stamped ONLY after Graph returns a message id, so the badge
 * means "Facebook accepted this", not "we clicked send".
 */
export const POST = withApi<Ctx>(async (req: NextRequest, ctx?: Ctx) => {
  const admin = await requirePermission("customers.manage");
  const id = (await ctx?.params)?.id ?? "";
  if (!id) throw notFound("Message not found");

  if (!canSendReplies()) {
    throw badRequest(
      "Replies are not configured — META_PAGE_TOKEN is not set on the server, so there is no credential to send with."
    );
  }

  const { body } = parseBody(replySchema, await req.json());

  const msg = await prisma.socialMessage.findUnique({
    where: { id },
    select: { id: true, senderId: true, senderName: true },
  });
  if (!msg) throw notFound("Message not found");

  const token = process.env.META_PAGE_TOKEN ?? "";
  const graph = `https://graph.facebook.com/v21.0/me/messages`;

  let messageId: string | null = null;
  let graphError: string | null = null;
  try {
    const res = await fetch(`${graph}?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // `messaging_type: UPDATE` — a human reply within the 24-hour window.
      // RECEIPT would be wrong here and Meta throttles templates for the rest.
      body: JSON.stringify({
        recipient: { id: msg.senderId },
        messaging_type: "UPDATE",
        message: { text: body },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      message_id?: string;
      error?: { message?: string; code?: number };
    };
    if (res.ok && data.message_id) {
      messageId = data.message_id;
    } else {
      graphError = data.error?.message ?? `Graph API returned ${res.status}`;
    }
  } catch (err) {
    graphError = err instanceof Error ? err.message : "Could not reach Facebook";
  }

  if (!messageId) {
    // Graph refused. Say so, leave the message unread-for-reply, and do not
    // touch repliedAt — the customer is still waiting.
    console.error(`[social] reply to ${msg.senderId} failed: ${graphError}`);
    await audit({
      adminId: admin.id,
      action: "SOCIAL_REPLY_FAILED",
      entityType: "SocialMessage",
      entityId: id,
      details: { error: graphError },
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent"),
    });
    throw badRequest(`Facebook did not accept the reply: ${graphError}`);
  }

  await prisma.socialMessage.update({
    where: { id },
    data: { isRead: true, repliedAt: new Date() },
  });

  await audit({
    adminId: admin.id,
    action: "SOCIAL_REPLY_SENT",
    entityType: "SocialMessage",
    entityId: id,
    // The reply body is stored in the audit log so the shop can prove what
    // it promised; it is customer-facing text, not a credential.
    details: { messageId, reply: body.slice(0, 500) },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({ id, messageId, replied: true });
});
