import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { getAdmin } from "@/lib/admin-auth";
import { canAccess, permissionLabel } from "@/lib/permissions";
import { Panel } from "@/components/admin/ui";

/**
 * Page-level permission gate for server components under /admin.
 * Call at the top of a page:
 *
 *   const denied = await pageGuard("orders.view");
 *   if (denied) return denied;
 *
 * Denied users never reach the page's own database queries — the panel
 * explains which permission is missing and where to get it granted.
 */
export async function pageGuard(permission: string): Promise<React.ReactNode | null> {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  if (await canAccess(admin, permission)) return null;
  return <AccessDenied permission={permission} role={admin.role} />;
}

export function AccessDenied({ permission, role }: { permission: string; role: string }) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-mist-50">Not allowed</h1>
        <p className="mt-0.5 text-sm text-mist-500">
          This page needs a permission your admin role doesn&apos;t have
        </p>
      </div>
      <Panel title="Permission required">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300">
            <ShieldAlert size={16} />
          </span>
          <div className="space-y-2 text-[0.86rem] leading-relaxed text-mist-300">
            <p>
              Your role (<span className="font-semibold text-mist-100">{role.replace("_", " ")}</span>) does
              not include <span className="font-semibold text-gold-300">“{permissionLabel(permission)}”</span>.
            </p>
            <p className="text-mist-500">
              A Super Admin can grant it, one checkbox at a time, in Admin → Roles &amp; Permissions.
            </p>
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 text-[0.84rem] text-mist-400 transition hover:text-gold-300"
            >
              <ArrowLeft size={14} /> Back to dashboard
            </Link>
          </div>
        </div>
      </Panel>
    </div>
  );
}
