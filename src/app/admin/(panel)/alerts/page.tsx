import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { pageGuard } from "@/components/admin/AccessDenied";
import { AlertsClient } from "@/components/admin/system/AlertsClient";

export const metadata: Metadata = {
  title: "System Log",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Admin System Log — every new-order / new-message alert, with Seen tracking. */
export default async function SystemLogPage() {
  const denied = await pageGuard("alerts.view");
  if (denied) return denied;

  return (
    <div>
      <AdminPageHeader
        title="System Log"
        subtitle="New orders and messages land here — mark each one Seen and the name of who saw it is kept"
      />
      <AlertsClient />
    </div>
  );
}
