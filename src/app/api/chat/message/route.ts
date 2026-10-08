import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, rateLimit, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { unauthorized } from "@/lib/errors";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const schema = z.object({
  body: z.string().trim().min(1, "Message cannot be empty").max(2000),
});

/**
 * POST /api/chat/message — customer sends a chat message.
 * Requires login ("login koren" gate is enforced here, the widget shows
 * the prompt before even trying).
 *
 * Reuses the latest OPEN thread; a closed conversation starts a new one.
 * Returns the refreshed thread + messages so the widget can re-render
 * in one round trip.
 */
export const POST = withApi(async (req: NextRequest) => {
  rateLimit(`chat:${clientIp(req)}`, 30, 60_000);
  const user = await getSessionUser();
  if (!user) throw unauthorized("Please log in to chat with us");

  const body = parseBody(schema, await req.json().catch(() => ({})));

  let thread = await prisma.chatThread.findFirst({
    where: { userId: user.id, status: "OPEN" },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true, status: true, createdAt: true, lastMessageAt: true },
  });
  if (!thread) {
    thread = await prisma.chatThread.create({ data: { userId: user.id } });
  }

  await prisma.chatMessage.create({
    data: { threadId: thread.id, sender: "USER", body: body.body },
  });
  await prisma.chatThread.update({
    where: { id: thread.id },
    data: { lastMessageAt: new Date() },
  });

  // Customer is actively here → the admin's earlier replies count as read.
  await prisma.chatMessage.updateMany({
    where: { threadId: thread.id, sender: "ADMIN", readAt: null },
    data: { readAt: new Date() },
  });

  const messages = await prisma.chatMessage.findMany({
    where: { threadId: thread.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, sender: true, body: true, createdAt: true },
  });

  return jsonOk({ thread, messages });
});
