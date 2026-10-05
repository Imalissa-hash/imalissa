"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  Heart,
  LayoutGrid,
  Menu,
  PackageSearch,
  Search,
  ShoppingBag,
  Sparkles,
  Tag,
  Truck,
  User,
  X,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { SearchBar } from "./SearchBar";
import { useStore } from "@/components/providers/AppProviders";
import { cn } from "@/lib/utils";
import type { CategoryNodeData } from "@/types/store";

interface HeaderProps {
  announcement: { enabled: boolean; text: string; link: string };
  categories: CategoryNodeData[];
  /** Uploaded site logo (Settings → Brand) — shown beside the site name. */
  logo?: string;
}

const QUICK_LINKS = [
  { href: "/search?sort=newest", label: "New Arrivals", icon: Sparkles },
  { href: "/search?sort=rating", label: "Top Rated", icon: Sparkles },
  { href: "/search?sort=discount", label: "Offers", icon: Tag },
  { href: "/track-order", label: "Track Order", icon: Truck },
];

export function Header({ announcement, categories, logo }: HeaderProps) {
  const { cart, wishlistIds, openCart, user } = useStore();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);
  const [megaOpen, setMegaOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close overlays on navigation.
  useEffect(() => {
    setMobileOpen(false);
    setMobileSearch(false);
    setMegaOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile menu is open.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const itemCount = cart?.itemCount ?? 0;

  return (
    <>
      {/* ── Announcement bar ─────────────────────────────── */}
      {announcement.enabled && announcement.text && (
        <div className="relative overflow-hidden border-b border-gold-500/15 bg-gradient-to-r from-ink-900 via-ink-850 to-ink-900">
          <div className="flex h-9 items-center">
            <div className="animate-marquee flex w-max whitespace-nowrap items-center gap-14 pr-14 text-[0.72rem] font-medium tracking-[0.14em] text-gold-200/90 uppercase">
              {[0, 1].map((dup) => (
                <span key={dup} className="flex items-center gap-14">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="flex items-center gap-3">
                      <span className="text-gold-500">✦</span>
                      <Link href={announcement.link || "/search"} className="hover:text-gold-100 transition">
                        {announcement.text}
                      </Link>
                    </span>
                  ))}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Main bar ─────────────────────────────────────── */}
      <header
        className={cn(
          "sticky top-0 z-40 transition-all duration-300",
          scrolled
            ? "border-b border-white/[0.07] bg-ink-950/85 backdrop-blur-xl shadow-[0_8px_32px_-16px_rgba(0,0,0,0.9)]"
            : "border-b border-transparent bg-ink-950"
        )}
      >
        <div className="mx-auto flex h-[68px] max-w-[1400px] items-center gap-4 px-4 sm:px-6 lg:h-[76px] lg:gap-8 lg:px-8">
          {/* Mobile: hamburger */}
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="-ml-1 rounded-lg p-2 text-mist-200 transition hover:bg-white/[0.05] lg:hidden"
          >
            <Menu size={22} />
          </button>

          <Logo className="shrink-0" logoSrc={logo} />

          {/* Desktop search */}
          <div className="hidden flex-1 lg:block lg:max-w-2xl">
            <SearchBar />
          </div>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {/* Mobile: search toggle */}
            <button
              onClick={() => setMobileSearch((v) => !v)}
              aria-label="Search"
              className="rounded-lg p-2.5 text-mist-200 transition hover:bg-white/[0.05] lg:hidden"
            >
              {mobileSearch ? <X size={20} /> : <Search size={20} />}
            </button>

            <Link
              href={user ? "/account" : "/auth/login"}
              className="group hidden items-center gap-2 rounded-xl px-3 py-2 text-sm text-mist-200 transition hover:bg-white/[0.05] hover:text-gold-300 sm:flex"
            >
              <User size={19} />
              <span className="hidden xl:flex xl:flex-col xl:leading-tight">
                <span className="text-[0.62rem] text-mist-500">Hello{user ? `, ${user.name.split(" ")[0]}` : ""}</span>
                <span className="text-[0.78rem] font-medium">{user ? "Account" : "Sign in"}</span>
              </span>
            </Link>

            <Link
              href="/wishlist"
              aria-label="Wishlist"
              className="relative rounded-xl p-2.5 text-mist-200 transition hover:bg-white/[0.05] hover:text-gold-300"
            >
              <Heart size={20} />
              {wishlistIds.length > 0 && (
                <motion.span
                  key={wishlistIds.length}
                  initial={{ scale: 0.5 }}
                  animate={{ scale: 1 }}
                  className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 px-1 text-[0.58rem] font-bold text-ink-950 shadow"
                >
                  {wishlistIds.length > 9 ? "9+" : wishlistIds.length}
                </motion.span>
              )}
            </Link>

            <button
              onClick={openCart}
              aria-label={`Cart with ${itemCount} items`}
              className="relative rounded-xl p-2.5 text-mist-200 transition hover:bg-white/[0.05] hover:text-gold-300"
            >
              <ShoppingBag size={20} />
              <AnimatePresence>
                {itemCount > 0 && (
                  <motion.span
                    key={itemCount}
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.4, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 22 }}
                    className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 px-1 text-[0.58rem] font-bold text-ink-950 shadow"
                  >
                    {itemCount > 9 ? "9+" : itemCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </div>
        </div>

        {/* Mobile inline search */}
        <AnimatePresence>
          {mobileSearch && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden border-t border-white/[0.06] bg-ink-900 lg:hidden"
            >
              <div className="px-4 py-3">
                <SearchBar autoFocus onNavigate={() => setMobileSearch(false)} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Category nav (desktop) ─────────────────────── */}
        <nav className="hidden border-t border-white/[0.06] lg:block">
          <div className="mx-auto flex h-11 max-w-[1400px] items-center gap-1 px-8">
            <div
              className="relative"
              onMouseEnter={() => setMegaOpen(true)}
              onMouseLeave={() => setMegaOpen(false)}
            >
              <button
                className={cn(
                  "flex h-11 items-center gap-2 px-4 text-[0.82rem] font-semibold uppercase tracking-[0.1em] transition",
                  megaOpen ? "text-gold-300" : "text-mist-100 hover:text-gold-300"
                )}
              >
                <LayoutGrid size={15} className="text-gold-500" />
                All Categories
                <ChevronDown size={14} className={cn("transition-transform", megaOpen && "rotate-180")} />
              </button>

              <AnimatePresence>
                {megaOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.2 }}
                    className="absolute left-0 top-full z-50 w-[680px] rounded-b-2xl border border-white/10 border-t-gold-500/30 bg-ink-850/98 p-6 shadow-lift backdrop-blur-xl"
                  >
                    <div className="grid grid-cols-3 gap-x-6 gap-y-1">
                      {categories.map((cat) => (
                        <div key={cat.id} className="py-1.5">
                          <Link
                            href={`/c/${cat.slug}`}
                            className="group flex items-center gap-2 text-[0.86rem] font-semibold text-gold-200 transition hover:text-gold-400"
                          >
                            {cat.name}
                            <span className="h-px w-0 bg-gold-500 transition-all duration-300 group-hover:w-5" />
                          </Link>
                          {cat.children.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                              {cat.children.slice(0, 6).map((child) => (
                                <Link
                                  key={child.id}
                                  href={`/c/${child.slug}`}
                                  className="text-[0.78rem] text-mist-400 transition hover:text-gold-300"
                                >
                                  {child.name}
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="mx-2 h-4 w-px bg-white/10" />

            {QUICK_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex h-11 items-center gap-1.5 px-4 text-[0.82rem] font-medium text-mist-200 transition hover:text-gold-300",
                  pathname === link.href && "text-gold-300"
                )}
              >
                <link.icon size={13} className="text-gold-500/80" />
                {link.label}
              </Link>
            ))}

            <Link
              href="/cart"
              className="ml-auto flex h-11 items-center gap-1.5 px-4 text-[0.82rem] font-medium text-mist-200 transition hover:text-gold-300"
            >
              <PackageSearch size={14} className="text-gold-500/80" />
              Cart
            </Link>
          </div>
        </nav>
      </header>

      {/* ── Mobile drawer ─────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm lg:hidden"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 340, damping: 34 }}
              className="fixed inset-y-0 left-0 z-50 flex w-[86%] max-w-sm flex-col border-r border-gold-500/20 bg-ink-900 lg:hidden"
            >
              <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
                <Logo logoSrc={logo} />
                <button
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close menu"
                  className="rounded-lg p-2 text-mist-300 transition hover:bg-white/[0.05]"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-4">
                <Link
                  href={user ? "/account" : "/auth/login"}
                  className="mb-4 flex items-center gap-3 rounded-xl border border-gold-500/20 bg-gold-500/[0.06] px-4 py-3"
                >
                  <User size={18} className="text-gold-400" />
                  <span className="text-sm">
                    <span className="block text-mist-400 text-[0.7rem]">
                      {user ? "Manage your account" : "Sign in / Register"}
                    </span>
                    <span className="font-medium text-mist-100">
                      {user ? user.name : "Access orders & wishlist"}
                    </span>
                  </span>
                </Link>

                <MobileCategoryList categories={categories} onNavigate={() => setMobileOpen(false)} />

                <div className="mt-4 border-t border-white/[0.06] pt-4">
                  <p className="px-3 pb-2 text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-mist-500">
                    Quick links
                  </p>
                  {QUICK_LINKS.map((l) => (
                    <MobileLink key={l.href} href={l.href} onClick={() => setMobileOpen(false)}>
                      <l.icon size={16} className="text-gold-500/80" />
                      {l.label}
                    </MobileLink>
                  ))}
                  <MobileLink href="/wishlist" onClick={() => setMobileOpen(false)}>
                    <Heart size={16} className="text-gold-500/80" />
                    Wishlist
                  </MobileLink>
                  <MobileLink href="/cart" onClick={() => setMobileOpen(false)}>
                    <ShoppingBag size={16} className="text-gold-500/80" />
                    Cart{itemCount > 0 ? ` (${itemCount})` : ""}
                  </MobileLink>
                </div>
              </div>

              <div className="border-t border-white/[0.07] p-4">
                <button
                  onClick={() => {
                    setMobileOpen(false);
                    router.push("/track-order");
                  }}
                  className="btn-outline-gold flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm"
                >
                  <Truck size={15} />
                  Track my order
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function MobileLink({
  href,
  children,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-mist-200 transition hover:bg-white/[0.05] hover:text-gold-300"
    >
      {children}
    </Link>
  );
}

function MobileCategoryList({
  categories,
  onNavigate,
}: {
  categories: CategoryNodeData[];
  onNavigate: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div>
      <p className="px-3 pb-2 text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-mist-500">
        Categories
      </p>
      <Link
        href="/search"
        onClick={onNavigate}
        className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-mist-100 transition hover:bg-white/[0.05] hover:text-gold-300"
      >
        <LayoutGrid size={16} className="text-gold-500" />
        Shop All
      </Link>
      {categories.map((cat) => (
        <div key={cat.id}>
          <div className="flex items-center">
            <Link
              href={`/c/${cat.slug}`}
              onClick={onNavigate}
              className="flex flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-mist-100 transition hover:bg-white/[0.05] hover:text-gold-300"
            >
              {cat.name}
            </Link>
            {cat.children.length > 0 && (
              <button
                onClick={() => setOpenId(openId === cat.id ? null : cat.id)}
                aria-label={`Toggle ${cat.name} submenu`}
                className="rounded-lg p-2.5 text-mist-400 transition hover:text-gold-300"
              >
                <ChevronDown size={15} className={cn("transition-transform", openId === cat.id && "rotate-180")} />
              </button>
            )}
          </div>
          <AnimatePresence initial={false}>
            {openId === cat.id && cat.children.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="overflow-hidden"
              >
                <div className="ml-5 border-l border-gold-500/20 pl-3">
                  {cat.children.map((child) => (
                    <Link
                      key={child.id}
                      href={`/c/${child.slug}`}
                      onClick={onNavigate}
                      className="block py-2 text-[0.84rem] text-mist-300 transition hover:text-gold-300"
                    >
                      {child.name}
                    </Link>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}
