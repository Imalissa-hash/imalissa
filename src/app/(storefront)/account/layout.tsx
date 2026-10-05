import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AccountShell } from "@/components/account/AccountShell";

/**
 * Account area guard: every /account/* page inherits this layout.
 * Unauthenticated visitors are sent to login and returned afterwards.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/auth/login?next=/account");

  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { createdAt: true, email: true, name: true },
  });

  return (
    <AccountShell
      name={profile?.name ?? user.name}
      email={profile?.email ?? user.email}
      memberSince={
        profile?.createdAt
          ? profile.createdAt.toLocaleDateString("en-US", { month: "short", year: "numeric" })
          : "—"
      }
    >
      {children}
    </AccountShell>
  );
}
