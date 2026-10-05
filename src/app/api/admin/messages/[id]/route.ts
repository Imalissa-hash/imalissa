import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { notFound } from "@/lib/errors";
import type { MessageDetail } from "@/components/admin/sales/MessageDetailClient";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const idFrom = async (ctx?: Ctx): Promise<string> => (await ctx?.params)?.id ?? "";

const patchSchema = z.object({
  action: z.enum(["markRead", "archive", "unarchive"]),
});

/**
 * Archive state lives in SiteSetting (module-owned key) because the
 * frozen ContactMessage schema has no archive column — see the list
 * route for the matching reader.
 */
const ARCHIVE_KEY = "messages.archivedIds";

async function loadArchivedIds(): Promise<string[]> {
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: ARCHIVE_KEY } });
    const v = row?.value;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

async function saveArchivedIds(ids: string[]): Promise<void> {
  await prisma.siteSetting.upsert({
    where: { key: ARCHIVE_KEY },
    update: { value: ids },
    create: { key: ARCHIVE_KEY, value: ids, group: "messages" },
  });
}

// ── GET /api/admin/messages/[id] — full message ──────────────
export const GET = withApi<Ctx>(async (req: NextRequest, ctx?: Ctx) => {
  await requireAdmin();
  const id = await idFrom(ctx);
  if (!id) throw notFound("Message not found");

  const message = await prisma.contactMessage.findUnique({ where: { id } });
  if (!message) throw notFound("Message not found");

  const archived = await loadArchivedIds();

  const payload: MessageDetail = {
    id: message.id,
    name: message.name,
    email: message.email,
    phone: message.phone,
    subject: message.subject,
    message: message.message,
    isRead: message.isRead,
    archived: archived.includes(message.id),
    createdAt: message.createdAt.toISOString(),
  };

  return jsonOk(payload);
});

// ── PATCH /api/admin/messages/[id] — markRead / archive ──────
export const PATCH = withApi<Ctx>(async (req: NextRequest, ctx?: Ctx) => {
  const admin = await requireAdmin();
  const id = await idFrom(ctx);
  if (!id) throw notFound("Message not found");

  const existing = await prisma.contactMessage.findUnique({
    where: { id },
    select: { id: true, subject: true, isRead: true },
  });
  if (!existing) throw notFound("Message not found");

  const body = parseBody(patchSchema, await req.json().catch(() => ({})));

  const before = await loadArchivedIds();
  const wasArchived = before.includes(id);
  let archived = wasArchived;

  if (body.action === "markRead" && !existing.isRead) {
    await prisma.contactMessage.update({ where: { id }, data: { isRead: true } });
  }

  if (body.action === "archive" && !wasArchived) {
    await prisma.$transaction([
      prisma.contactMessage.update({ where: { id }, data: { isRead: true } }),
      prisma.siteSetting.upsert({
        where: { key: ARCHIVE_KEY },
        update: { value: [...before, id] },
        create: { key: ARCHIVE_KEY, value: [id], group: "messages" },
      }),
    ]);
    archived = true;
  }

  if (body.action === "unarchive" && wasArchived) {
    await saveArchivedIds(before.filter((x) => x !== id));
    archived = false;
  }

  const fresh = await prisma.contactMessage.findUnique({
    where: { id },
    select: { isRead: true },
  });

  await audit({
    adminId: admin.id,
    action:
      body.action === "markRead"
        ? "MESSAGE_READ"
        : body.action === "archive"
          ? "MESSAGE_ARCHIVE"
          : "MESSAGE_UNARCHIVE",
    entityType: "ContactMessage",
    entityId: id,
    details: {
      subject: existing.subject,
      isRead: fresh?.isRead ?? existing.isRead,
      archived,
    },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({ id, isRead: fresh?.isRead ?? existing.isRead, archived });
});
