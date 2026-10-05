import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/admin-auth";
import { AdminForgotClient } from "@/components/admin/AdminForgotClient";

export const metadata: Metadata = {
  title: "Admin Password Reset",
  robots: { index: false, follow: false },
};

/** Ask for the admin email → the API emails a single-use reset link. */
export default async function AdminForgotPage() {
  const admin = await getAdmin();
  if (admin) redirect("/admin");
  return <AdminForgotClient />;
}
