import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSettingGroup } from "@/lib/settings";
import { socialConfigured } from "@/lib/social";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { SocialClient } from "@/components/admin/social/SocialClient";
import { pageGuard } from "@/components/admin/AccessDenied";
import { loadInbox, loadThread } from "../inbox";

export const metadata: Metadata = {
  title: "Conversation",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const BOXES = ["unread", "all", "replied"];

/**
 * Admin → Social Inbox → one conversation.
 *
 * The [id] in the URL is a message id rather than the raw PSID: a message id
 * is unique and readable, a PSID is a long opaque number, and this matches
 * how /admin/messages/[id] and /admin/orders/[id] are addressed. It only
 * anchors the lookup — a conversation has no table of its own, it is every
 * SocialMessage sharing a channel and senderId, which is exactly what a reply
 * is addressed to.
 *
 * The surrounding list is loaded identically to /admin/social so opening a
 * thread does not reflow the panel, and the URL stays shareable: a colleague
 * opening this link lands on the same conversation with the same filters.
 */
export default async function AdminSocialThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const denied = await pageGuard("customers.view");
  if (denied) return denied;

  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v : "";
  };
  const rawBox = one("box");
  const boxExplicit = BOXES.includes(rawBox);
  const box = boxExplicit ? rawBox : "unread";
  const q = one("q").trim();
  const requestedPage = Math.max(1, Number(one("page")) || 1);

  const [thread, settings, cfg] = await Promise.all([
    loadThread(id),
    getSettingGroup("social"),
    Promise.resolve(socialConfigured()),
  ]);
  // An id that resolves to nothing is a bad link, not an empty inbox.
  if (!thread || !thread.anchor) notFound();

  const inbox = await loadInbox({ box, boxExplicit, q, requestedPage });

  const subtitle = cfg.canVerify
    ? `${inbox.counts.unread} unread · ${inbox.counts.replied} replied through Facebook`
    : "Facebook Page messages arrive here once the connection is finished";

  return (
    <div>
      <AdminPageHeader title="Social Inbox" subtitle={subtitle} />
      <SocialClient
        items={inbox.items}
        counts={inbox.counts}
        total={inbox.total}
        totalPages={inbox.totalPages}
        page={inbox.page}
        searchParams={sp}
        activeBox={inbox.effectiveBox}
        connected={cfg.canVerify}
        canSend={cfg.canSend}
        missing={cfg.missing}
        verifyToken={settings.verifyToken}
        pageId={settings.pageId}
        webhookPath="/api/webhooks/meta"
        selectedId={thread.anchor.id}
        thread={thread.messages}
        sender={{
          name: thread.senderName ?? "Facebook sender",
          id: thread.anchor.senderId,
          channel: thread.anchor.channel,
        }}
        quickReplies={settings.quickReplies}
      />
    </div>
  );
}
