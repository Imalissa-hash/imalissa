import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withApi, jsonOk, parseBody } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import type { MessageCounts, MessageRow } from "@/components/admin/sales/MessagesClient";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/messages — contact form inbox.
 * Filters: q, box (inbox | unread | archived | all), page.
 *
 * ContactMessage has no archive column (schema is frozen for this module),
 * so the archived set is persisted as an id list in SiteSetting under a
 * module-owned key that no other module reads.
 */

const PAGE_SIZE = 20;
const ARCHIVE_KEY = "messages.archivedIds";

const BOXES = ["inbox", "unread", "archived", "all"] as const;

const querySchema = z.object({
  q: z.string().trim().max(100).optional(),
  box: z.enum(BOXES).default("inbox"),
  page: z.coerce.number().int().min(1).max(100000).optional(),
});

async function loadArchivedIds(): Promise<string[]> {
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: ARCHIVE_KEY } });
    const v = row?.value;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export const GET = withApi(async (req: NextRequest) => {
  await requirePermission("messages.view");

  const sp = req.nextUrl.searchParams;
  const query = parseBody(querySchema, {
    q: sp.get("q") ?? undefined,
    box: sp.get("box") ?? undefined,
    page: sp.get("page") ?? undefined,
  });
  const page = query.page ?? 1;

  const archived = await loadArchivedIds();

  const where: Prisma.ContactMessageWhereInput =
    query.box === "archived"
      ? { id: { in: archived } }
      : query.box === "all"
        ? {}
        : { id: { notIn: archived } };
  if (query.box === "unread") where.isRead = false;
  if (query.q) {
    where.OR = [
      { name: { contains: query.q } },
      { email: { contains: query.q } },
      { phone: { contains: query.q } },
      { subject: { contains: query.q } },
      { message: { contains: query.q } },
    ];
  }

  const [rows, total, inbox, unread, archivedCount] = await Promise.all([
    prisma.contactMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        subject: true,
        message: true,
        isRead: true,
        createdAt: true,
      },
    }),
    prisma.contactMessage.count({ where }),
    prisma.contactMessage.count({ where: { id: { notIn: archived } } }),
    prisma.contactMessage.count({ where: { id: { notIn: archived }, isRead: false } }),
    prisma.contactMessage.count({ where: { id: { in: archived } } }),
  ]);

  const archivedSet = new Set(archived);
  const items: MessageRow[] = rows.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    phone: m.phone,
    subject: m.subject,
    preview: m.message.length > 160 ? `${m.message.slice(0, 160)}…` : m.message,
    isRead: m.isRead,
    archived: archivedSet.has(m.id),
    createdAt: m.createdAt.toISOString(),
  }));

  const counts: MessageCounts = {
    inbox,
    unread,
    archived: archivedCount,
  };

  return jsonOk({
    items,
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    counts,
  });
});
