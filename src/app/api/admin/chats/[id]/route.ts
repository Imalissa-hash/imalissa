import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody } from "@/lib/api";
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/chats/[id] — one thread with its full conversation.
 * Guarded by messages.view.
 */
export const GET = withApi(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requirePermission("messages.view");
    const { id } = await ctx.params;

    const thread = await prisma.chatThread.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        lastMessageAt: true,
        createdAt: true,
        user: { select: { id: true, name: true, phone: true, email: true } },
        messages: {
          orderBy: { createdAt: "asc" },
          select: { id: true, sender: true, body: true, readAt: true, createdAt: true },
        },
      },
    });
    if (!thread) throw notFound("Conversation not found");

    const unread = thread.messages.filter(
      (m) => m.sender === "USER" && !m.readAt
    ).length;

    return jsonOk({
      thread: {
        id: thread.id,
        status: thread.status,
        createdAt: thread.createdAt.toISOString(),
        lastMessageAt: thread.lastMessageAt.toISOString(),
        user: thread.user,
      },
      messages: thread.messages.map((m) => ({
        id: m.id,
        sender: m.sender,
        body: m.body,
        readAt: m.readAt ? true : false,
        createdAt: m.createdAt.toISOString(),
      })),
      unread,
    });
  }
);

const patchSchema = z.object({
  action: z.enum(["read", "close", "reopen"]),
});

/**
 * PATCH /api/admin/chats/[id] — staff-side thread actions.
 *   { action: "read" }    → mark the customer's messages as seen by staff
 *   { action: "close" }   → close the conversation
 *   { action: "reopen" }  → reopen it
 * Guarded by messages.manage (mutation).
 */
export const PATCH = withApi(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requirePermission("messages.manage");
    const { id } = await ctx.params;
    const body = parseBody(patchSchema, await req.json().catch(() => ({})));

    const thread = await prisma.chatThread.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!thread) throw notFound("Conversation not found");

    if (body.action === "read") {
      await prisma.chatMessage.updateMany({
        where: { threadId: id, sender: "USER", readAt: null },
        data: { readAt: new Date() },
      });
      return jsonOk({ unread: 0 });
    }

    await prisma.chatThread.update({
      where: { id },
      data: { status: body.action === "close" ? "CLOSED" : "OPEN" },
    });
    return jsonOk({ status: body.action === "close" ? "CLOSED" : "OPEN" });
  }
);

const replySchema = z.object({
  body: z.string().trim().min(1, "Message cannot be empty").max(2000),
});

/**
 * POST /api/admin/chats/[id] — admin replies to the customer.
 * The customer's next widget load marks it read (readAt).
 * Guarded by messages.manage.
 */
export const POST = withApi(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requirePermission("messages.manage");
    const { id } = await ctx.params;
    const body = parseBody(replySchema, await req.json().catch(() => ({})));

    const thread = await prisma.chatThread.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!thread) throw notFound("Conversation not found");

    const message = await prisma.chatMessage.create({
      data: { threadId: id, sender: "ADMIN", body: body.body },
      select: { id: true, sender: true, body: true, createdAt: true },
    });
    await prisma.chatThread.update({
      where: { id },
      data: { lastMessageAt: new Date() },
    });

    return jsonOk(
      {
        id: message.id,
        sender: message.sender,
        body: message.body,
        readAt: false,
        createdAt: message.createdAt.toISOString(),
      },
      { status: 201 }
    );
  }
);
