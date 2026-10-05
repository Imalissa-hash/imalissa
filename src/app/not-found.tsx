import Link from "next/link";
import { Compass, Home, Search, ShoppingBag } from "lucide-react";

/**
 * Premium 404 — self-contained (no DB reads) so it never fails even if
 * the database is unavailable.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[75vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-xl text-center">
        <p className="font-display text-[7rem] font-bold leading-none text-gold-gradient sm:text-[9rem]">
          404
        </p>
        <div className="-mt-4 flex items-center justify-center gap-3 text-mist-500">
          <span className="h-px w-16 bg-gradient-to-r from-transparent to-gold-500/40" />
          <Compass size={18} className="text-gold-500" />
          <span className="h-px w-16 bg-gradient-to-l from-transparent to-gold-500/40" />
        </div>

        <h1 className="mt-6 font-display text-2xl font-bold text-mist-50">
          This page drifted off the map
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-mist-400">
          The link may be outdated, the product may have sold out and been retired, or there was a
          typo in the address. Let&apos;s get you back to something good.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn-gold flex items-center gap-2 rounded-xl px-6 py-3 text-sm">
            <Home size={15} /> Back to home
          </Link>
          <Link
            href="/search"
            className="btn-outline-gold flex items-center gap-2 rounded-xl px-6 py-3 text-sm"
          >
            <Search size={15} /> Browse products
          </Link>
          <Link
            href="/track-order"
            className="rounded-xl border border-white/10 px-6 py-3 text-sm text-mist-300 transition hover:border-gold-500/40 hover:text-gold-300"
          >
            Track an order
          </Link>
        </div>

        <div className="mt-10 flex items-center justify-center gap-2 text-[0.8rem] text-mist-600">
          <ShoppingBag size={14} className="text-gold-500/70" />
          Need help? Visit{" "}
          <Link href="/contact" className="text-gold-400 underline hover:text-gold-300">
            Contact Us
          </Link>
        </div>
      </div>
    </div>
  );
}
