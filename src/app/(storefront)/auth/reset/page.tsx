import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = {
  title: "Reset Password",
  description: "Choose a new password for your Imalissa account.",
  robots: { index: false, follow: false },
};

/**
 * Landing page for the emailed reset link: /auth/reset?e=<email>&t=<token>.
 * searchParams is a Promise in Next 15. An incomplete link renders the form's
 * invalid state (which offers a fresh link) instead of a broken page.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; t?: string }>;
}) {
  const { e, t } = await searchParams;
  return <ResetPasswordForm email={e ?? ""} token={t ?? ""} />;
}
