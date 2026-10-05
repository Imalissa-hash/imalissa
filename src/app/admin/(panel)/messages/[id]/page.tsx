import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { BackLink } from "@/components/admin/AdminShell";
import { MessageDetailClient } from "@/components/admin/sales/MessageDetailClient";
import type { MessageDetail } from "@/components/admin/sales/MessageDetailClient";

export const metadata: Metadata = {
  title: "Message",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const ARCHIVE_KEY = "messages.archivedIds";

async function isArchived(id: string): Promise<boolean> {
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: ARCHIVE_KEY } });
    const v = row?.value;
    return Array.isArray(v) && v.includes(id);
  } catch {
    return false;
  }
}

/** Contact message detail page (params is a Promise in Next 15). */
export default async function AdminMessageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const message = await prisma.contactMessage.findUnique({ where: { id } });
  if (!message) notFound();

  const archived = await isArchived(message.id);

  const payload: MessageDetail = {
    id: message.id,
    name: message.name,
    email: message.email,
    phone: message.phone,
    subject: message.subject,
    message: message.message,
    isRead: message.isRead,
    archived,
    createdAt: message.createdAt.toISOString(),
  };

  return (
    <div>
      <BackLink href="/admin/messages" label="Back to messages" />
      <MessageDetailClient message={payload} />
    </div>
  );
}
