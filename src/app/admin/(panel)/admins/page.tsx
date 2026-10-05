import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { AdminsClient } from "@/components/admin/system/AdminsClient";

export const metadata: Metadata = {
  title: "Admins",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Admin account management (viewing for all admins, mutations SUPER_ADMIN-only). */
export default function AdminsPage() {
  return (
    <div>
      <AdminPageHeader
        title="Admin Accounts"
        subtitle="Staff who can sign in to this panel"
      />
      <AdminsClient />
    </div>
  );
}
