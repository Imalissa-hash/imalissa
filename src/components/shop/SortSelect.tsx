"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDownUp } from "lucide-react";
import { cn } from "@/lib/utils";

const OPTIONS: { value: string; label: string }[] = [
  { value: "relevance", label: "Popularity" },
  { value: "newest", label: "Newest first" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "rating", label: "Customer Rating" },
  { value: "discount", label: "Biggest Discount" },
];

/** Sort dropdown — writes `sort` to the URL, resets pagination. */
export function SortSelect({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("sort") ?? "relevance";

  const onChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "relevance") params.delete("sort");
    else params.set("sort", value);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className={cn("relative", className)}>
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Sort products"
        className="appearance-none rounded-xl border border-white/10 bg-ink-850 py-2.5 pl-9 pr-9 text-[0.84rem] text-mist-200 transition focus:border-gold-500/50 focus:outline-none"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value} className="bg-ink-850">
            {o.label}
          </option>
        ))}
      </select>
      <ArrowDownUp
        size={14}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gold-500"
      />
    </div>
  );
}
