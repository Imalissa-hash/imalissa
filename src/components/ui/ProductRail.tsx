"use client";

import { useRef, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ProductCard, ProductCardSkeleton } from "./ProductCard";
import type { ProductCardData } from "@/types/store";
import { cn } from "@/lib/utils";

/**
 * Horizontally scrolling product rail with arrow controls.
 * Swipes naturally on touch devices (momentum scroll).
 */
export function ProductRail({
  products,
  loading = false,
  compact = false,
}: {
  products: ProductCardData[];
  loading?: boolean;
  compact?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const update = () => {
    const el = ref.current;
    if (!el) return;
    setAtStart(el.scrollLeft < 8);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 8);
  };

  useEffect(() => {
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [products.length]);

  const scrollBy = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * (el.clientWidth * 0.8), behavior: "smooth" });
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <ProductCardSkeleton key={i} compact={compact} />
        ))}
      </div>
    );
  }

  if (!products.length) return null;

  return (
    <div className="group/rail relative">
      <div
        ref={ref}
        onScroll={update}
        className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 scroll-smooth"
        style={{ scrollbarWidth: "none" }}
      >
        {products.map((p, i) => (
          <div
            key={p.id}
            className={cn(
              "w-[46%] shrink-0 snap-start sm:w-[30%] lg:w-[23%]",
              compact && "lg:w-[18.2%]"
            )}
          >
            <ProductCard product={p} index={i} compact={compact} />
          </div>
        ))}
      </div>

      {/* Desktop arrows */}
      {!atStart && (
        <button
          onClick={() => scrollBy(-1)}
          aria-label="Scroll left"
          className="absolute -left-4 top-[38%] z-20 hidden h-10 w-10 items-center justify-center rounded-full border border-gold-500/40 bg-ink-850/90 text-gold-300 opacity-0 shadow-lift backdrop-blur transition-all hover:bg-ink-800 group-hover/rail:opacity-100 lg:flex"
        >
          <ChevronLeft size={18} />
        </button>
      )}
      {!atEnd && (
        <button
          onClick={() => scrollBy(1)}
          aria-label="Scroll right"
          className="absolute -right-4 top-[38%] z-20 hidden h-10 w-10 items-center justify-center rounded-full border border-gold-500/40 bg-ink-850/90 text-gold-300 opacity-0 shadow-lift backdrop-blur transition-all hover:bg-ink-800 group-hover/rail:opacity-100 lg:flex"
        >
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  );
}
