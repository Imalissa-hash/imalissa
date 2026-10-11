import { withApi, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/chat — the floating support-chat widget's state.
 *
 * Always answers (never 401) so the widget can render the right panel:
 *   { loggedIn: false }                     → show the login prompt
 *   { loggedIn: true, thread, messages }    → show the conversation
 *
 * Opening the widget marks the admin's replies as read (readAt), keeping
 * the "unread reply" count honest for the next poll.
 *
 * Speed matters here: the widget prefetches this on every page so the panel
 * opens with no spinner, and Aiven MySQL sits a network hop away. The
 * mark-as-read write and the message read are therefore issued together —
 * they depend only on `thread.id`, not on each other — which halves the
 * round trips on the hot path.
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
  const [, messages] = await Promise.all([
    prisma.chatMessage.updateMany({
      where: { threadId: thread.id, sender: "ADMIN", readAt: null },
      data: { readAt: new Date() },
    }),
    prisma.chatMessage.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, sender: true, body: true, imageUrl: true, createdAt: true },
    }),
  ]);

  return jsonOk({ loggedIn: true, thread, messages, unread: 0 });
});
