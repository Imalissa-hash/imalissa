import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { socialConfigured } from "@/lib/social";
import { BackLink } from "@/components/admin/AdminShell";
import { SocialThreadClient } from "@/components/admin/social/SocialThreadClient";
import type { SocialThreadMessage } from "@/components/admin/social/SocialThreadClient";
import { pageGuard } from "@/components/admin/AccessDenied";

export const metadata: Metadata = {
  title: "Conversation",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Admin → Social Inbox → one conversation.
 *
 * The [id] in the URL is a message id — the same id the inbox list links to
 * — but it only anchors the lookup. A "conversation" has no table of its
 * own: it is every SocialMessage sharing a senderId and channel, which is
 * exactly what a reply is addressed to. Using a message id rather than the
 * raw PSID keeps the URL stable and readable, and matches how the other
 * detail pages (/admin/messages/[id], /admin/orders/[id]) are addressed.
 */
export default async function AdminSocialThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await pageGuard("customers.view");
  if (denied) return denied;

  const { id } = await params;

  const anchor = await prisma.socialMessage.findUnique({
    where: { id },
    select: { id: true, senderId: true, channel: true, senderName: true },
  });
  if (!anchor) notFound();

  const [rows, cfg] = await Promise.all([
    prisma.socialMessage.findMany({
      where: { senderId: anchor.senderId, channel: anchor.channel },
      // Oldest first — a conversation reads downward in arrival order, not
      // the reverse the inbox list needs to show the newest thing on top.
      orderBy: { receivedAt: "asc" },
      select: {
        id: true,
        body: true,
        isRead: true,
        repliedAt: true,
        receivedAt: true,
        senderName: true,
      },
    }),
    Promise.resolve(socialConfigured()),
  ]);

  const messages: SocialThreadMessage[] = rows.map((m) => ({
    id: m.id,
    body: m.body,
    isRead: m.isRead,
    repliedAt: m.repliedAt ? m.repliedAt.toISOString() : null,
    receivedAt: m.receivedAt.toISOString(),
  }));

  // A senderName can land on a later row (Meta only supplies it when it
  // resolves a profile), so fall back across the thread before giving up.
  const senderName =
    rows.find((m) => m.senderName)?.senderName ?? anchor.senderName ?? "Facebook sender";

  return (
    <div>
      <BackLink href="/admin/social" label="Back to inbox" />
      <div className="mt-4">
        <SocialThreadClient
          anchorId={anchor.id}
          senderName={senderName}
          senderId={anchor.senderId}
          channel={anchor.channel}
          messages={messages}
          canSend={cfg.canSend}
        />
      </div>
    </div>
  );
}
