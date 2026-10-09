import { withApi, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/chat — the homepage support-chat widget's state.
 *
 * Always answers (never 401) so the widget can render the right panel:
 *   { loggedIn: false }                     → show the login prompt
 *   { loggedIn: true, thread, messages }    → show the conversation
 *
 * Opening the widget marks the admin's replies as read (readAt), keeping
 * the "unread reply" count honest for the next poll.
 */
export const GET = withApi(async () => {
  const user = await getSessionUser();
  if (!user) return jsonOk({ loggedIn: false, thread: null, messages: [], unread: 0 });

  // Latest thread whatever its status: the customer should keep seeing the
  // history even after staff closed it (the composer then starts a new one).
  const thread = await prisma.chatThread.findFirst({
    where: { userId: user.id },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true, status: true, createdAt: true, lastMessageAt: true },
  });

  if (!thread) return jsonOk({ loggedIn: true, thread: null, messages: [], unread: 0 });

  // The widget is open → the customer is reading the admin's replies now.
  await prisma.chatMessage.updateMany({
    where: { threadId: thread.id, sender: "ADMIN", readAt: null },
    data: { readAt: new Date() },
  });

  const messages = await prisma.chatMessage.findMany({
    where: { threadId: thread.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, sender: true, body: true, imageUrl: true, createdAt: true },
  });

  return jsonOk({ loggedIn: true, thread, messages, unread: 0 });
});
