import type { Metadata } from "next";
import { AdminResetClient } from "@/components/admin/AdminResetClient";

export const metadata: Metadata = {
  title: "Admin Set New Password",
  robots: { index: false, follow: false },
};

/**
 * Landing page for the emailed admin reset link: /admin/reset?e=&t=.
 * Deliberately NOT redirected when a session exists — a signed-in admin may be
 * the one opening their own emailed link, and the reset must still work.
 */
export default async function AdminResetPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; t?: string }>;
}) {
  const { e, t } = await searchParams;
  return <AdminResetClient email={e ?? ""} token={t ?? ""} />;
}
