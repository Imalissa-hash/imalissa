"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ProductRail } from "@/components/ui/ProductRail";
import type { ProductCardData } from "@/types/store";

/**
 * Recently viewed products — tracked server-side via a session cookie
 * (works for guests too). Renders nothing when there is no history.
 */
export function RecentlyViewed({ limit = 8 }: { limit?: number }) {
  const [items, setItems] = useState<ProductCardData[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/recently-viewed", { cache: "no-store" });
        const json = await res.json();
        if (alive && json.ok && Array.isArray(json.data) && json.data.length > 0) {
          setItems(json.data.slice(0, limit));
        } else if (alive) {
          setItems([]);
        }
      } catch {
        if (alive) setItems([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [limit]);

  if (items === null || items.length === 0) return null;

  return (
    <section className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
      <SectionHeading
        title="Recently Viewed"
        subtitle="Continue where you left off"
      />
      <ProductRail products={items} compact />
    </section>
  );
}
