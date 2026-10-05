import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { MessagesClient } from "@/components/admin/sales/MessagesClient";
import type { MessageCounts, MessageRow } from "@/components/admin/sales/MessagesClient";

export const metadata: Metadata = {
  title: "Messages",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const BOXES = ["inbox", "unread", "archived", "all"];
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

/** Contact message inbox — server-rendered from searchParams. */
export default async function AdminMessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v : "";
  };

  const q = one("q").trim();
  const box = BOXES.includes(one("box")) ? one("box") : "inbox";
  const requestedPage = Math.max(1, Number(one("page")) || 1);

  const archived = await loadArchivedIds();

  const where: Prisma.ContactMessageWhereInput =
    box === "archived"
      ? { id: { in: archived } }
      : box === "all"
        ? {}
        : { id: { notIn: archived } };
  if (box === "unread") where.isRead = false;
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { email: { contains: q } },
      { phone: { contains: q } },
      { subject: { contains: q } },
      { message: { contains: q } },
    ];
  }

  const [rows, total, inbox, unread, archivedCount] = await Promise.all([
    prisma.contactMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (requestedPage - 1) * PAGE_SIZE,
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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

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

  const counts: MessageCounts = { inbox, unread, archived: archivedCount };

  return (
    <div>
      <AdminPageHeader
        title="Messages"
        subtitle={`${inbox.toLocaleString()} message${inbox === 1 ? "" : "s"} in the inbox · ${unread} unread`}
      />
      <MessagesClient
        items={items}
        total={total}
        totalPages={totalPages}
        page={page}
        searchParams={sp}
        counts={counts}
      />
    </div>
  );
}
