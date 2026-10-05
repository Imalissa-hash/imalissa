"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal, X, ChevronDown, Star } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn, formatBDT } from "@/lib/utils";

export interface FilterContext {
  brands: { name: string; slug: string }[];
  colors: string[];
  sizes: string[];
  priceBounds: { min: number; max: number };
}

/**
 * Faceted filter UI — writes to the URL so results are shareable,
 * crawlable and survive refresh. Includes a mobile slide-up drawer.
 */
export function FilterSidebar({ context }: { context: FilterContext }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  const [priceMin, setPriceMin] = useState(searchParams.get("min") ?? "");
  const [priceMax, setPriceMax] = useState(searchParams.get("max") ?? "");

  useEffect(() => {
    setPriceMin(searchParams.get("min") ?? "");
    setPriceMax(searchParams.get("max") ?? "");
  }, [searchParams]);

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === "") params.delete(k);
        else params.set(k, v);
      }
      params.delete("page"); // filters reset pagination
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
      });
      setOpen(false);
    },
    [searchParams, router, pathname]
  );

  const toggleInList = (key: string, value: string) => {
    const current = searchParams.get(key)?.split(",").filter(Boolean) ?? [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    setParams({ [key]: next.join(",") || null });
  };

  const activeIn = (key: string, value: string) =>
    (searchParams.get(key)?.split(",") ?? []).includes(value);

  const activeCount = ["brand", "color", "size", "min", "max", "rating", "stock", "discount"]
    .map((k) => searchParams.get(k))
    .filter(Boolean).length;

  const ratingFilter = Number(searchParams.get("rating") ?? 0);

  const body = (
    <div className="space-y-1">
      {/* Active chips */}
      {activeCount > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 pb-4">
          {(["brand", "color", "size", "rating", "stock", "discount"] as const).map((k) => {
            const v = searchParams.get(k);
            if (!v) return null;
            return (
              <button
                key={k}
                onClick={() => setParams({ [k]: null })}
                className="flex items-center gap-1.5 rounded-full border border-gold-500/40 bg-gold-500/10 px-3 py-1 text-[0.72rem] text-gold-300 transition hover:bg-gold-500/20"
              >
                {k}: {k === "stock" ? "In stock" : v}
                <X size={11} />
              </button>
            );
          })}
          <button
            onClick={() =>
              setParams({ brand: null, color: null, size: null, min: null, max: null, rating: null, stock: null, discount: null })
            }
            className="rounded-full border border-white/15 px-3 py-1 text-[0.72rem] text-mist-400 transition hover:text-mist-200"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Price */}
      <FilterSection title="Price Range" defaultOpen>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            placeholder={`Min ${context.priceBounds.min}`}
            className="input-premium !py-2 text-[0.82rem]"
            aria-label="Minimum price"
          />
          <span className="text-mist-600">–</span>
          <input
            type="number"
            inputMode="numeric"
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            placeholder={`Max ${context.priceBounds.max}`}
            className="input-premium !py-2 text-[0.82rem]"
            aria-label="Maximum price"
          />
        </div>
        <button
          onClick={() => setParams({ min: priceMin || null, max: priceMax || null })}
          className="mt-3 w-full rounded-lg border border-gold-500/40 bg-gold-500/10 py-2 text-[0.8rem] font-semibold text-gold-300 transition hover:bg-gold-500/20"
        >
          Apply
        </button>
      </FilterSection>

      {/* Discount */}
      <FilterSection title="Discount">
        {[0, 10, 20, 30, 50].map((d) => (
          <label
            key={d}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[0.84rem] text-mist-300 transition hover:bg-white/[0.04]"
          >
            <input
              type="radio"
              name="discount"
              checked={Number(searchParams.get("discount") ?? 0) === d}
              onChange={() => setParams({ discount: d ? String(d) : null })}
              className="accent-gold-500"
            />
            {d === 0 ? "Any discount" : `${d}% or more`}
          </label>
        ))}
      </FilterSection>

      {/* Rating */}
      <FilterSection title="Customer Rating">
        {[4, 3, 2, 1].map((r) => (
          <button
            key={r}
            onClick={() => setParams({ rating: ratingFilter === r ? null : String(r) })}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[0.84rem] transition",
              ratingFilter === r
                ? "bg-gold-500/10 text-gold-300"
                : "text-mist-300 hover:bg-white/[0.04]"
            )}
          >
            <span className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  size={12}
                  className={s <= r ? "text-gold-500" : "text-mist-700"}
                  fill={s <= r ? "currentColor" : "none"}
                />
              ))}
            </span>
            <span>&amp; up</span>
          </button>
        ))}
      </FilterSection>

      {/* Availability */}
      <FilterSection title="Availability" defaultOpen>
        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[0.84rem] text-mist-300 transition hover:bg-white/[0.04]">
          <input
            type="checkbox"
            checked={searchParams.get("stock") === "1"}
            onChange={(e) => setParams({ stock: e.target.checked ? "1" : null })}
            className="accent-gold-500"
          />
          In stock only
        </label>
      </FilterSection>

      {/* Brands */}
      {context.brands.length > 0 && (
        <FilterSection title="Brand">
          <div className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
            {context.brands.map((b) => (
              <label
                key={b.slug}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[0.84rem] text-mist-300 transition hover:bg-white/[0.04]"
              >
                <input
                  type="checkbox"
                  checked={activeIn("brand", b.slug)}
                  onChange={() => toggleInList("brand", b.slug)}
                  className="accent-gold-500"
                />
                {b.name}
              </label>
            ))}
          </div>
        </FilterSection>
      )}

      {/* Colors */}
      {context.colors.length > 0 && (
        <FilterSection title="Color">
          <div className="flex flex-wrap gap-2 px-1 py-1">
            {context.colors.map((c) => (
              <button
                key={c}
                onClick={() => toggleInList("color", c)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-[0.78rem] transition",
                  activeIn("color", c)
                    ? "border-gold-500/70 bg-gold-500/15 text-gold-200"
                    : "border-white/10 text-mist-300 hover:border-gold-500/40"
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </FilterSection>
      )}

      {/* Sizes */}
      {context.sizes.length > 0 && (
        <FilterSection title="Size">
          <div className="flex flex-wrap gap-2 px-1 py-1">
            {context.sizes.map((s) => (
              <button
                key={s}
                onClick={() => toggleInList("size", s)}
                className={cn(
                  "min-w-10 rounded-lg border px-2.5 py-1.5 text-[0.78rem] transition",
                  activeIn("size", s)
                    ? "border-gold-500/70 bg-gold-500/15 text-gold-200"
                    : "border-white/10 text-mist-300 hover:border-gold-500/40"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </FilterSection>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="sticky top-36 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">{body}</div>
      </aside>

      {/* Mobile trigger + drawer */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-gold-500/50 bg-ink-850/95 px-6 py-3 text-sm font-semibold text-gold-300 shadow-lift backdrop-blur lg:hidden"
      >
        <SlidersHorizontal size={16} />
        Filters{activeCount > 0 ? ` (${activeCount})` : ""}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm lg:hidden"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-gold-500/30 bg-ink-900 p-5 lg:hidden"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold text-gold-gradient">Filters</h3>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close filters"
                  className="rounded-lg p-2 text-mist-400 hover:bg-white/[0.06]"
                >
                  <X size={18} />
                </button>
              </div>
              {body}
              <button
                onClick={() => setOpen(false)}
                className="btn-gold mt-5 w-full rounded-xl py-3 text-sm"
              >
                Show results
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function FilterSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-white/[0.06] py-2 last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between py-2 text-left text-[0.84rem] font-semibold text-mist-200"
      >
        {title}
        <ChevronDown
          size={15}
          className={cn("text-mist-500 transition-transform", open && "rotate-180")}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="pt-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
