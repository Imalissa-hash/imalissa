"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Analytics range switch — links (not state) so ranges are bookmarkable
 * and drive the server-rendered `?range=7|30|90` searchParam.
 */

const RANGES = [7, 30, 90] as const;

export function AnalyticsClient({ range }: { range: number }) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Analytics range">
      {RANGES.map((r) => (
        <Link
          key={r}
          href={`/admin/analytics?range=${r}`}
          aria-current={range === r ? "true" : undefined}
          className={cn(
            "rounded-full border px-4 py-1.5 text-[0.8rem] transition",
            range === r
              ? "border-gold-500/50 bg-gold-500/[0.12] font-semibold text-gold-300"
              : "border-white/10 text-mist-400 hover:border-gold-500/30 hover:text-mist-200"
          )}
        >
          Last {r} days
        </Link>
      ))}
    </nav>
  );
}
