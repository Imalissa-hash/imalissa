import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Pagination — page-based links preserving existing query params.
 */
export function Pagination({
  page,
  totalPages,
  basePath,
  searchParams,
}: {
  page: number;
  totalPages: number;
  basePath: string;
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  if (totalPages <= 1) return null;

  const build = (p: number) => {
    const params = new URLSearchParams();
    if (searchParams) {
      for (const [k, v] of Object.entries(searchParams)) {
        if (k === "page") continue;
        if (typeof v === "string") params.set(k, v);
        else if (Array.isArray(v)) v.forEach((x) => params.append(k, x));
      }
    }
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  };

  const pages: (number | "…")[] = [];
  const window_size = 1;
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= window_size) pages.push(p);
    else if (pages[pages.length - 1] !== "…") pages.push("…");
  }

  return (
    <nav className="mt-10 flex items-center justify-center gap-1.5" aria-label="Pagination">
      {page > 1 && (
        <Link
          href={build(page - 1)}
          className="rounded-lg border border-white/10 px-3.5 py-2 text-sm text-mist-300 transition hover:border-gold-500/40 hover:text-gold-300"
        >
          Prev
        </Link>
      )}
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`gap-${i}`} className="px-2 text-mist-600">
            …
          </span>
        ) : (
          <Link
            key={p}
            href={build(p)}
            aria-current={p === page ? "page" : undefined}
            className={cn(
              "min-w-10 rounded-lg border px-3.5 py-2 text-center text-sm transition",
              p === page
                ? "border-gold-500/60 bg-gold-500/15 font-semibold text-gold-300"
                : "border-white/10 text-mist-300 hover:border-gold-500/40 hover:text-gold-300"
            )}
          >
            {p}
          </Link>
        )
      )}
      {page < totalPages && (
        <Link
          href={build(page + 1)}
          className="rounded-lg border border-white/10 px-3.5 py-2 text-sm text-mist-300 transition hover:border-gold-500/40 hover:text-gold-300"
        >
          Next
        </Link>
      )}
    </nav>
  );
}
