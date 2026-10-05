import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { AuditClient } from "@/components/admin/system/AuditClient";

export const metadata: Metadata = {
  title: "Audit Log",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Audit log browser — filtering/pagination handled by AuditClient. */
export default function AuditPage() {
  return (
    <div>
      <AdminPageHeader
        title="Audit Log"
        subtitle="Every admin action, with IP and (redacted) payload details"
      />
      <AuditClient />
    </div>
  );
}
