"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { Heart, ShoppingBag, Zap } from "lucide-react";
import { cn, formatBDT } from "@/lib/utils";
import { Rating } from "@/components/ui/Rating";
import { useStore } from "@/components/providers/AppProviders";
import type { ProductCardData } from "@/types/store";

/**
 * Premium product card — zoom on hover, quick-add, wishlist toggle,
 * discount/new/bestseller badges. Handles both SVG placeholders and
 * raster images.
 */
export function ProductCard({
  product,
  index = 0,
  compact = false,
}: {
  product: ProductCardData;
  index?: number;
  compact?: boolean;
}) {
  const { addToCart, toggleWishlist, wishlistIds } = useStore();
  const [adding, setAdding] = useState(false);
  const wished = wishlistIds.includes(product.id);
  const hasVariants = product.colors.length > 0 || product.sizes.length > 0;
  const outOfStock = product.stock <= 0;

  const quickAdd = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (outOfStock || hasVariants) {
      // Variants require selection on the product page.
      window.location.href = `/product/${product.slug}`;
      return;
    }
    setAdding(true);
    await addToCart({ productId: product.id, quantity: 1 });
    setAdding(false);
  };

  const badges: { label: string; cls: string }[] = [];
  if (outOfStock) badges.push({ label: "Sold Out", cls: "bg-ink-900/90 text-mist-300 border-white/20" });
  else if (product.discountPercent >= 15)
    badges.push({ label: `-${product.discountPercent}%`, cls: "bg-gradient-to-br from-gold-400 to-gold-600 text-ink-950" });
  if (product.newArrival && !outOfStock)
    badges.push({ label: "New", cls: "bg-emerald-500/90 text-white" });
  if (product.isBestseller && !outOfStock)
    badges.push({ label: "Bestseller", cls: "bg-gradient-to-r from-rose-500/90 to-pink-500/90 text-white" });

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay: Math.min(index * 0.06, 0.3), ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        href={`/product/${product.slug}`}
        className={cn(
          "group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-ink-800 to-ink-900 transition-all duration-400",
          "hover:border-gold-500/35 hover:shadow-[0_24px_48px_-24px_rgba(0,0,0,0.9),0_0_0_1px_rgba(212,175,55,0.12)]",
          "hover:-translate-y-1"
        )}
      >
        {/* Image */}
        <div className={cn("relative overflow-hidden bg-ink-850", compact ? "aspect-square" : "aspect-[4/5]")}>
          <div className="img-zoom h-full w-full">
            {product.image?.endsWith(".svg") ? (
              // SVG placeholders skip the image optimizer (tiny + crisp).
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.image}
                alt={product.name}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : product.image ? (
              <Image
                src={product.image}
                alt={product.name}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-mist-600">
                <ShoppingBag size={34} />
              </div>
            )}
          </div>

          {/* Badges */}
          <div className="absolute left-3 top-3 z-10 flex flex-col items-start gap-1.5">
            {badges.map((b) => (
              <span
                key={b.label}
                className={cn(
                  "rounded-md border px-2 py-[3px] text-[0.64rem] font-bold uppercase tracking-wider shadow",
                  b.cls
                )}
              >
                {b.label}
              </span>
            ))}
          </div>

          {/* Wishlist */}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleWishlist(product.id);
            }}
            aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
            className={cn(
              "absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur-md transition-all duration-300",
              wished
                ? "border-gold-500/60 bg-gold-500/20 text-gold-300 scale-110"
                : "border-white/15 bg-ink-900/70 text-mist-300 opacity-0 group-hover:opacity-100 hover:text-gold-300 sm:opacity-0"
            )}
          >
            <Heart size={15} fill={wished ? "currentColor" : "none"} />
          </button>

          {/* Quick add slide-up */}
          <div className="absolute inset-x-0 bottom-0 z-10 translate-y-full p-3 transition-transform duration-400 group-hover:translate-y-0 group-focus-within:translate-y-0">
            <button
              onClick={quickAdd}
              disabled={adding || outOfStock}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[0.8rem] font-semibold backdrop-blur-md transition",
                outOfStock
                  ? "cursor-not-allowed bg-ink-900/80 text-mist-500"
                  : "btn-gold"
              )}
            >
              {outOfStock ? (
                "Out of Stock"
              ) : hasVariants ? (
                <>
                  <Zap size={14} /> Select Options
                </>
              ) : (
                <>
                  <ShoppingBag size={14} /> {adding ? "Adding…" : "Quick Add"}
                </>
              )}
            </button>
          </div>

          {/* Subtle bottom gradient */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-ink-900/70 to-transparent" />
        </div>

        {/* Info */}
        <div className="flex flex-1 flex-col gap-1 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-gold-500/80">
              {product.brandName ?? product.categoryName}
            </span>
            {product.rating > 0 && (
              <Rating value={product.rating} count={product.reviewCount} size={11} />
            )}
          </div>

          <h3 className="line-clamp-2 text-[0.88rem] font-medium leading-snug text-mist-100 transition group-hover:text-gold-200">
            {product.name}
          </h3>

          <div className="mt-auto flex items-end gap-2 pt-1.5">
            <span className="font-display text-[1.05rem] font-semibold text-gold-gradient">
              {formatBDT(product.salePrice)}
            </span>
            {product.compareAtPrice && product.compareAtPrice > product.salePrice && (
              <span className="pb-0.5 text-[0.76rem] text-mist-600 line-through">
                {formatBDT(product.compareAtPrice)}
              </span>
            )}
          </div>

          {product.soldCount > 0 && (
            <p className="text-[0.66rem] text-mist-500">
              {product.soldCount >= 1000
                ? `${(product.soldCount / 1000).toFixed(1)}k+ sold`
                : `${product.soldCount} sold`}
            </p>
          )}
        </div>
      </Link>
    </motion.div>
  );
}

export function ProductCardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-800">
      <div className={cn("skeleton", compact ? "aspect-square" : "aspect-[4/5]")} />
      <div className="space-y-2.5 p-4">
        <div className="skeleton h-3 w-1/3 rounded" />
        <div className="skeleton h-4 w-full rounded" />
        <div className="skeleton h-4 w-2/3 rounded" />
        <div className="skeleton h-5 w-1/2 rounded" />
      </div>
    </div>
  );
}
