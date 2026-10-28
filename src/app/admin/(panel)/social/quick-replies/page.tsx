import type { Metadata } from "next";
import { getSettingGroup } from "@/lib/settings";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { pageGuard } from "@/components/admin/AccessDenied";
import { QuickRepliesClient } from "@/components/admin/social/QuickRepliesClient";

export const metadata: Metadata = {
  title: "Quick replies",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Admin → Social → Quick replies.
 *
 * The composer's canned replies were hard-coded until now, which meant adding
 * or rewording one needed a code change and a redeploy. They are a settings
 * value (social.quickReplies) like everything else the owner can change, so
 * this screen reads them server-side and hands the list to the editor.
 *
 * Reads under `customers.view` — the same guard as the inbox itself — because
 * these replies are meaningless outside it. Writing requires
 * `customers.manage`, checked in the API rather than here so the page still
 * opens for anyone allowed to look.
 *
 * The static segment deliberately sits beside `social/[id]`: Next resolves
 * `/admin/social/quick-replies` to this page instead of treating it as a
 * message id.
 */
export default async function AdminQuickRepliesPage() {
  const denied = await pageGuard("customers.view");
  if (denied) return denied;

  const settings = await getSettingGroup("social");

  return (
    <div>
      <AdminPageHeader
        title="Quick replies"
        subtitle="The canned answers offered beside the reply composer — add, edit, reorder or remove them here."
      />
      <QuickRepliesClient initial={settings.quickReplies} />
    </div>
  );
}
