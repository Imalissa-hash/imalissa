import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { pageGuard } from "@/components/admin/AccessDenied";
import { RolesClient } from "@/components/admin/system/RolesClient";

export const metadata: Metadata = {
  title: "Roles & Permissions",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Roles & Permissions — grant each role exactly what it needs, one
 * checkbox at a time. Super Admin only: pageGuard("roles.manage") is a
 * super-only key, and the API behind it uses requireRole() on top.
 */
export default async function RolesPage() {
  const denied = await pageGuard("roles.manage");
  if (denied) return denied;

  return (
    <div>
      <AdminPageHeader
        title="Roles & Permissions"
        subtitle="Tick exactly what each role may do — changes apply to every admin with that role"
      />
      <RolesClient />
    </div>
  );
}
