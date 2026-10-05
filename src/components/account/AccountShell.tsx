"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Heart,
  LayoutDashboard,
  LogOut,
  MapPin,
  Package,
  Settings,
  Star,
} from "lucide-react";
import { useStore } from "@/components/providers/AppProviders";
import { getInitials } from "@/lib/utils";

const NAV = [
  { href: "/account", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/account/orders", label: "My Orders", icon: Package },
  { href: "/account/addresses", label: "Addresses", icon: MapPin },
  { href: "/wishlist", label: "Wishlist", icon: Heart },
  { href: "/account/reviews", label: "My Reviews", icon: Star },
  { href: "/account/settings", label: "Settings", icon: Settings },
];

/** Account sidebar: nav + identity card + logout (client). */
export function AccountShell({
  name,
  email,
  memberSince,
  children,
}: {
  name: string;
  email: string | null;
  memberSince: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { setUser, toast } = useStore();

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* still clear local state */
    }
    setUser(null);
    toast("You have been signed out", "info");
    router.push("/");
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid gap-7 lg:grid-cols-[280px_1fr]">
        {/* ── Sidebar ─────────────────────────────────────── */}
        <aside className="lg:sticky lg:top-36 lg:h-fit">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
            <div className="flex items-center gap-3.5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-gold-500/30 bg-gradient-to-br from-gold-500/20 to-gold-500/[0.04] font-display text-lg font-bold text-gold-300">
                {getInitials(name)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[0.95rem] font-semibold text-mist-50">{name}</p>
                <p className="truncate text-[0.76rem] text-mist-500">
                  {email ?? "No email on file"}
                </p>
              </div>
            </div>
            <p className="mt-3 text-[0.7rem] uppercase tracking-[0.16em] text-mist-600">
              Member since {memberSince}
            </p>

            <nav className="mt-5 space-y-1">
              {NAV.map((item) => {
                const active = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[0.88rem] transition ${
                      active
                        ? "bg-gold-500/[0.1] text-gold-300"
                        : "text-mist-400 hover:bg-white/[0.04] hover:text-mist-100"
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="account-nav-pill"
                        className="absolute inset-y-1 left-0 w-[3px] rounded-full bg-gold-500"
                      />
                    )}
                    <item.icon size={16} className={active ? "text-gold-400" : "text-mist-600"} />
                    {item.label}
                  </Link>
                );
              })}

              <button
                onClick={logout}
                className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[0.88rem] text-mist-500 transition hover:bg-danger/10 hover:text-danger"
              >
                <LogOut size={16} /> Sign out
              </button>
            </nav>
          </div>

          <Link
            href="/track-order"
            className="mt-4 flex items-center justify-between rounded-2xl border border-gold-500/20 bg-gold-500/[0.05] px-5 py-4 text-[0.84rem] text-gold-300 transition hover:border-gold-500/40"
          >
            Track a guest order
            <Package size={16} />
          </Link>
        </aside>

        {/* ── Content ─────────────────────────────────────── */}
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

/** Shared card wrapper used by all account sections. */
export function AccountPanel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-mist-50">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[0.84rem] text-mist-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
