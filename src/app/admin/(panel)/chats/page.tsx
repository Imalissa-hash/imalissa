import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { pageGuard } from "@/components/admin/AccessDenied";
import { ChatsClient } from "@/components/admin/system/ChatsClient";

export const metadata: Metadata = {
  title: "Live Chat",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Admin Live Chat — every customer support conversation, answerable in place. */
export default async function LiveChatPage() {
  const denied = await pageGuard("messages.view");
  if (denied) return denied;

  return (
    <div>
      <AdminPageHeader
        title="Live Chat"
        subtitle="Customer chat from the homepage widget — open a conversation and reply right here"
      />
      <ChatsClient />
    </div>
  );
}
