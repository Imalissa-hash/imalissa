import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/admin-auth";
import { getSettings } from "@/lib/settings";
import { AdminShell } from "@/components/admin/AdminShell";

/**
 * Guarded admin chrome. Everything under /admin/(panel) requires a valid
 * admin session; /admin/login lives outside this layout on purpose.
 */
export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [admin, settings] = await Promise.all([getAdmin(), getSettings()]);
  if (!admin) redirect("/admin/login");

  return (
    <AdminShell
      admin={{ name: admin.name, email: admin.email, role: admin.role }}
      logoSrc={settings.brand.logo}
    >
      {children}
    </AdminShell>
  );
}
