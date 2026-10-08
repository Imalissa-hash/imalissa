import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/admin-auth";
import { getSettings } from "@/lib/settings";
import { getRolePermissions } from "@/lib/permissions";
import { AdminShell } from "@/components/admin/AdminShell";

/**
 * Guarded admin chrome. Everything under /admin/(panel) requires a valid
 * admin session; /admin/login lives outside this layout on purpose.
 *
 * The signed-in admin's effective permission set is resolved here and
 * handed to AdminShell (sidebar + alert bell visibility). Real enforcement
 * is server-side: pageGuard() inside each page and requirePermission()
 * inside every admin API route.
 */
export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [admin, settings] = await Promise.all([getAdmin(), getSettings()]);
  if (!admin) redirect("/admin/login");

  const permissions = [...(await getRolePermissions(admin.role))];

  return (
    <AdminShell
      admin={{ name: admin.name, email: admin.email, role: admin.role }}
      logoSrc={settings.brand.logo}
      permissions={permissions}
    >
      {children}
    </AdminShell>
  );
}
