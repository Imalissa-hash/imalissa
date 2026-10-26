import type { Metadata } from "next";
import { getSettingGroup } from "@/lib/settings";
import { socialConfigured } from "@/lib/social";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { SocialClient } from "@/components/admin/social/SocialClient";
import { pageGuard } from "@/components/admin/AccessDenied";
import { loadInbox } from "./inbox";

export const metadata: Metadata = {
  title: "Social Inbox",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const BOXES = ["unread", "all", "replied"];

/**
 * Admin → Social Inbox — the conversation list with nothing selected.
 *
 * It renders the same client component as /admin/social/[id] with an empty
 * middle pane, so opening a conversation swaps the thread in without the
 * surrounding panel reflowing into a different layout.
 *
 * The page is honest about state: it reads the SAME config the webhook reads
 * (verify token set? META_APP_SECRET present? META_PAGE_TOKEN present?) and
 * says exactly which credential is missing rather than rendering a
 * "connected" badge for an install that cannot receive a message.
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

  const [settings, cfg, inbox] = await Promise.all([
    getSettingGroup("social"),
    // Read once so the banner and the list can never disagree.
    Promise.resolve(socialConfigured()),
    loadInbox({ box, q, requestedPage }),
  ]);

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
        connected={cfg.canVerify}
        canSend={cfg.canSend}
        missing={cfg.missing}
        verifyToken={settings.verifyToken}
        pageId={settings.pageId}
        webhookPath="/api/webhooks/meta"
        selectedId={null}
        thread={null}
        sender={null}
      />
    </div>
  );
}
