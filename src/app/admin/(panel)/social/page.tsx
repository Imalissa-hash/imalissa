import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSettingGroup } from "@/lib/settings";
import { socialConfigured } from "@/lib/social";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { SocialClient, type SocialRow, type SocialCounts } from "@/components/admin/social/SocialClient";
import { pageGuard } from "@/components/admin/AccessDenied";

export const metadata: Metadata = {
  title: "Social Inbox",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const BOXES = ["unread", "all", "replied"];

/**
 * Admin → Social Inbox — messages from the shop's Facebook Page.
 *
 * The page is honest about state: it reads the SAME config the webhook reads
 * (verify token set? META_APP_SECRET present? META_PAGE_TOKEN present?) and
 * either shows the inbox or shows exactly which credential is missing with
 * the Meta steps to supply it. It never renders a "connected" badge for an
 * install that cannot actually receive a message.
 */
export default async function AdminSocialPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Answering a customer's Facebook message is customer-facing work, so it
  // sits under the existing customers permission rather than a new key.
  const denied = await pageGuard("customers.view");
  if (denied) return denied;

  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v : "";
  };
  const box = BOXES.includes(one("box")) ? one("box") : "unread";
  const q = one("q").trim();
  const requestedPage = Math.max(1, Number(one("page")) || 1);

  const [settings, cfg] = await Promise.all([
    getSettingGroup("social"),
    // Read once so the banner and the list can never disagree.
    Promise.resolve(socialConfigured()),
  ]);

  const where: Prisma.SocialMessageWhereInput = {};
  if (box === "unread") where.isRead = false;
  if (box === "replied") where.repliedAt = { not: null };
  if (q) {
    where.OR = [
      { senderName: { contains: q } },
      { senderId: { contains: q } },
      { body: { contains: q } },
    ];
  }

  const [rows, total, unread, replied] = await Promise.all([
    prisma.socialMessage.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      skip: (requestedPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.socialMessage.count({ where }),
    prisma.socialMessage.count({ where: { isRead: false } }),
    prisma.socialMessage.count({ where: { repliedAt: { not: null } } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const items: SocialRow[] = rows.map((m) => ({
    id: m.id,
    channel: m.channel,
    senderId: m.senderId,
    senderName: m.senderName,
    body: m.body,
    isRead: m.isRead,
    repliedAt: m.repliedAt ? m.repliedAt.toISOString() : null,
    receivedAt: m.receivedAt.toISOString(),
  }));

  const counts: SocialCounts = { unread, replied, total: total };

  const webhookPath = "/api/webhooks/meta";

  return (
    <div>
      <AdminPageHeader
        title="Social Inbox"
        subtitle={
          cfg.canVerify
            ? `${unread.toLocaleString()} unread · ${replied} replied through Facebook`
            : "Facebook Page messages arrive here once the connection is finished"
        }
      />
      <SocialClient
        items={items}
        total={total}
        totalPages={totalPages}
        page={page}
        searchParams={sp}
        counts={counts}
        connected={cfg.canVerify}
        canSend={cfg.canSend}
        missing={cfg.missing}
        verifyToken={settings.verifyToken}
        pageId={settings.pageId}
        webhookPath={webhookPath}
      />
    </div>
  );
}
