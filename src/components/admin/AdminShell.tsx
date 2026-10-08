"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  Bell,
  ChevronLeft,
  Download,
  ExternalLink,
  Gauge,
  Gift,
  Inbox,
  LayoutGrid,
  LogOut,
  Menu,
  Package,
  Boxes,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Star,
  Users,
  X,
  RefreshCcw,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { AlertBell } from "@/components/admin/AlertBell";

interface AdminIdentity {
  name: string;
  email: string;
  role: string;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  /** Permission key required to see this entry (absent = always visible). */
  perm?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV: NavSection[] = [
  {
    title: "Overview",
    items: [{ href: "/admin", label: "Dashboard", icon: Gauge }],
  },
  {
    title: "Catalog",
    items: [
      { href: "/admin/products", label: "Products", icon: Package, perm: "products.view" },
      { href: "/admin/import", label: "Import products", icon: Download, perm: "import.view" },
      { href: "/admin/categories", label: "Categories", icon: LayoutGrid, perm: "categories.view" },
      { href: "/admin/inventory", label: "Inventory", icon: Boxes, perm: "inventory.view" },
    ],
  },
  {
    title: "Sales",
    items: [
      { href: "/admin/orders", label: "Orders", icon: ShoppingBag, perm: "orders.view" },
      { href: "/admin/sync", label: "Sync Center", icon: RefreshCcw, perm: "sync.view" },
      { href: "/admin/coupons", label: "Coupons", icon: Gift, perm: "coupons.view" },
    ],
  },
  {
    title: "Customers",
    items: [
      { href: "/admin/customers", label: "Customers", icon: Users, perm: "customers.view" },
      { href: "/admin/reviews", label: "Reviews", icon: Star, perm: "reviews.view" },
      { href: "/admin/messages", label: "Messages", icon: Inbox, perm: "messages.view" },
    ],
  },
  {
    title: "Storefront",
    items: [
      { href: "/admin/homepage", label: "Homepage", icon: Sparkles, perm: "homepage.view" },
      { href: "/admin/analytics", label: "Analytics", icon: BarChart3, perm: "analytics.view" },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/admin/settings", label: "Settings", icon: Settings, perm: "settings.view" },
      { href: "/admin/admins", label: "Admins", icon: ShieldCheck, perm: "admins.view" },
      {
        href: "/admin/roles",
        label: "Roles & Permissions",
        icon: SlidersHorizontal,
        perm: "roles.manage",
      },
      { href: "/admin/alerts", label: "System Log", icon: Bell, perm: "alerts.view" },
      { href: "/admin/audit", label: "Audit Log", icon: ScrollText, perm: "audit.view" },
    ],
  },
];

/** Admin chrome: fixed sidebar + topbar wrapping all /admin/(panel) pages. */
export function AdminShell({
  admin,
  logoSrc,
  permissions,
  children,
}: {
  admin: AdminIdentity;
  /** Uploaded site logo (Settings → Brand) shown beside the site name. */
  logoSrc?: string;
  /** Permission keys the admin's role grants — drives nav visibility + bell. */
  permissions: string[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  /**
   * Auto sign-out after 1 minute of inactivity (client-side watchdog).
   * The session cookie is still enforced server-side by requireAdmin on
   * every admin request — this only ends the session early when nobody
   * is at the keyboard.
   */
  useEffect(() => {
    const IDLE_MS = 60_000;
    const EVENTS = [
      "pointerdown",
      "pointermove",
      "keydown",
      "wheel",
      "touchstart",
      "scroll",
      "focus",
    ] as const;
    const OPTIONS: AddEventListenerOptions = { passive: true, capture: true };

    let timer: ReturnType<typeof setTimeout>;
    const expire = () => {
      fetch("/api/admin/auth/logout", { method: "POST" })
        .catch(() => {
          /* session may already be gone — the redirect below still applies */
        })
        .finally(() => {
          router.push("/admin/login");
          router.refresh();
        });
    };
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(expire, IDLE_MS);
    };

    EVENTS.forEach((event) => window.addEventListener(event, reset, OPTIONS));
    reset();

    return () => {
      clearTimeout(timer);
      EVENTS.forEach((event) => window.removeEventListener(event, reset, OPTIONS));
    };
  }, [router]);

  const logout = async () => {
    try {
      await fetch("/api/admin/auth/logout", { method: "POST" });
    } catch {
      /* clear local state regardless */
    }
    router.push("/admin/login");
    router.refresh();
  };

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  // Sidebar entries the signed-in admin's role actually grants (page-level
  // guards + API permissions still enforce server-side — this is display).
  const visibleNav = NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.perm || permissions.includes(item.perm)),
  })).filter((section) => section.items.length > 0);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 py-5">
        <Link href="/admin" className="block" aria-label="Admin dashboard">
          {/* linked={false} — this <Link> is already the anchor; a second one
              inside it (Logo's default) would be an <a> inside an <a>. */}
          <Logo linked={false} logoSrc={logoSrc} />
        </Link>
        <button
          className="text-mist-500 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
        {visibleNav.map((section) => (
          <div key={section.title}>
            <p className="px-3 pb-2 text-[0.66rem] font-bold uppercase tracking-[0.2em] text-mist-600">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`relative flex items-center gap-3 rounded-xl px-3 py-2 text-[0.86rem] transition ${
                      active
                        ? "bg-gold-500/[0.12] text-gold-300"
                        : "text-mist-400 hover:bg-white/[0.04] hover:text-mist-100"
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="admin-nav-pill"
                        className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-gold-500"
                      />
                    )}
                    <item.icon
                      size={16}
                      className={active ? "text-gold-400" : "text-mist-600"}
                    />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/[0.07] p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gold-500/30 bg-gold-500/10 text-[0.8rem] font-bold text-gold-300">
            {admin.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.84rem] font-semibold text-mist-100">{admin.name}</p>
            <p className="truncate text-[0.7rem] uppercase tracking-wide text-mist-600">
              {admin.role.replace("_", " ")}
            </p>
          </div>
          <button
            onClick={logout}
            aria-label="Sign out"
            className="rounded-lg p-2 text-mist-500 transition hover:bg-danger/10 hover:text-danger"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-ink-950">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-white/[0.07] bg-ink-900 lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-40 bg-black/70 lg:hidden"
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", damping: 26, stiffness: 260 }}
              className="fixed inset-y-0 left-0 z-50 w-64 border-r border-white/[0.07] bg-ink-900 lg:hidden"
            >
              {sidebar}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Content */}
      <div className="lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/[0.07] bg-ink-950/90 px-4 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              className="rounded-lg border border-white/10 p-2 text-mist-300 lg:hidden"
            >
              <Menu size={16} />
            </button>
            <span className="hidden text-[0.78rem] uppercase tracking-[0.2em] text-mist-600 sm:block">
              Admin Panel
            </span>
          </div>

          <div className="flex items-center gap-2">
            {permissions.includes("alerts.view") && <AlertBell />}
            <Link
              href="/"
              target="_blank"
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-[0.78rem] text-mist-400 transition hover:border-gold-500/40 hover:text-gold-300"
            >
              <ExternalLink size={13} /> View store
            </Link>
            <Link
              href="/admin/settings"
              className="hidden rounded-lg border border-white/10 p-2 text-mist-400 transition hover:border-gold-500/40 hover:text-gold-300 sm:block"
              aria-label="Settings"
            >
              <Settings size={15} />
            </Link>
          </div>
        </header>

        <main className="p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

/** Page header used at the top of every admin page. */
export function AdminPageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-bold text-mist-50">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-mist-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Back link helper used on detail/form pages. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mb-4 inline-flex items-center gap-1.5 text-[0.84rem] text-mist-500 transition hover:text-gold-300"
    >
      <ChevronLeft size={14} /> {label}
    </Link>
  );
}
