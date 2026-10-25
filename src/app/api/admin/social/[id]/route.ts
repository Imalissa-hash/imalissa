import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { notFound } from "@/lib/errors";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * The body is optional: the mark-read caller from the inbox list sends none
 * at all, so a missing or malformed body must not turn a successful read
 * into a 400.
 */
const readSchema = z.object({
  /**
   * True when the caller opened the conversation page and wants every
   * message from this sender marked read, not just the one it navigated
   * through. Defaults to false, preserving single-message behaviour.
   */
  conversation: z.boolean().optional(),
});

const idFrom = async (ctx?: Ctx): Promise<string> => (await ctx?.params)?.id ?? "";

/**
 * PATCH /api/admin/social/[id] — mark one Facebook message as read, or with
 * `{ conversation: true }` the entire thread with that sender.
 *
 * Read state is ours, not Meta's: it only controls what the admin's Unread
 * tab shows. It is never pushed back to Facebook, because doing so would
 * need permissions this app does not have, and pretending otherwise would
 * make the badge lie.
 *
 * Sending a reply lives one level down at POST /api/admin/social/[id]/reply.
 * It used to be mounted here while the UI and its own documentation called
 * `/reply`, so every reply from the inbox 404'd.
 */
export const PATCH = withApi<Ctx>(async (req: NextRequest, ctx?: Ctx) => {
  const admin = await requirePermission("customers.manage");
  const id = await idFrom(ctx);
  if (!id) throw notFound("Message not found");

  const msg = await prisma.socialMessage.findUnique({
    where: { id },
    select: { id: true, senderId: true, channel: true },
  });
  if (!msg) throw notFound("Message not found");

  // Tolerant parse — see readSchema above.
  const parsed = readSchema.safeParse(await req.json().catch(() => ({})));
  const wholeConversation = parsed.success && parsed.data.conversation === true;

  if (wholeConversation) {
    // Opening a conversation reads it. Marking only the message the admin
    // happened to land on would leave the Unread tab claiming a thread is
    // still waiting when it has plainly been opened.
    const result = await prisma.socialMessage.updateMany({
      where: { senderId: msg.senderId, channel: msg.channel },
      data: { isRead: true },
    });
    await audit({
      adminId: admin.id,
      action: "SOCIAL_CONVERSATION_READ",
      entityType: "SocialMessage",
      entityId: id,
      details: { senderId: msg.senderId, channel: msg.channel, count: result.count },
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent"),
    });
    return jsonOk({ id, isRead: true, conversation: true, updated: result.count });
  }

  await prisma.socialMessage.update({
    where: { id },
    data: { isRead: true },
  });

  await audit({
    adminId: admin.id,
    action: "SOCIAL_MESSAGE_READ",
    entityType: "SocialMessage",
    entityId: id,
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({ id, isRead: true });
});
