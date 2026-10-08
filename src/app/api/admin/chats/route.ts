import { NextRequest } from "next/server";
import { withApi, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/chats — every support-chat thread for Admin → Live Chat.
 *
 * Query: ?status=OPEN|CLOSED|ALL (default ALL) &page=1&size=20
 * Each item carries the customer, the last message and the count of
 * unread CUSTOMER messages (what the staff still hasn't opened).
 * Guarded by messages.view (same permission family as the contact inbox).
 */
export const GET = withApi(async (req: NextRequest) => {
  await requirePermission("messages.view");

  const p = req.nextUrl.searchParams;
  const status = p.get("status") ?? "ALL";
  const page = Math.max(1, Number(p.get("page") ?? 1) || 1);
  const size = Math.min(50, Math.max(5, Number(p.get("size") ?? 20) || 20));

  const where =
    status === "OPEN" || status === "CLOSED" ? ({ status } as const) : {};

  const [total, openCount, threads] = await Promise.all([
    prisma.chatThread.count({ where }),
    prisma.chatThread.count({ where: { status: "OPEN" } }),
    prisma.chatThread.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      skip: (page - 1) * size,
      take: size,
      select: {
        id: true,
        status: true,
        lastMessageAt: true,
        createdAt: true,
        user: { select: { name: true, phone: true, email: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          // Preview = the last HUMAN message: the auto responder's boilerplate
          // would otherwise hide what the customer actually asked.
          where: { sender: { not: "AUTO" } },
          select: { body: true, sender: true, createdAt: true },
        },
      },
    }),
  ]);

  // One groupBy for unread customer messages across the listed threads.
  const ids = threads.map((t) => t.id);
  const unreadRows = ids.length
    ? await prisma.chatMessage.groupBy({
        by: ["threadId"],
        where: { threadId: { in: ids }, sender: "USER", readAt: null },
        _count: { _all: true },
      })
    : [];
  const unreadMap = new Map(unreadRows.map((r) => [r.threadId, r._count._all]));

  return jsonOk({
    items: threads.map((t) => ({
      id: t.id,
      status: t.status,
      userName: t.user.name,
      phone: t.user.phone,
      email: t.user.email,
      lastBody: t.messages[0]?.body ?? null,
      lastSender: t.messages[0]?.sender ?? null,
      lastAt: t.lastMessageAt.toISOString(),
      unread: unreadMap.get(t.id) ?? 0,
      createdAt: t.createdAt.toISOString(),
    })),
    total,
    openCount,
    page,
    size,
  });
});
