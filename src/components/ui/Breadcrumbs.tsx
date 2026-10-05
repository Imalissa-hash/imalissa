import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Breadcrumbs (server component) — SEO-friendly with JSON-LD on pages.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[0.78rem] text-mist-500">
      <Link href="/" className="flex items-center gap-1 text-mist-400 transition hover:text-gold-300">
        <Home size={12} />
        Home
      </Link>
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="flex items-center gap-1.5">
          <ChevronRight size={12} className="text-mist-700" />
          {item.href ? (
            <Link href={item.href} className="text-mist-400 transition hover:text-gold-300">
              {item.label}
            </Link>
          ) : (
            <span className="text-mist-200">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
