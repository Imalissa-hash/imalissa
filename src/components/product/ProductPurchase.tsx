"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Heart, Minus, Plus, Share2, ShoppingBag, Zap, Check, Copy, MessageCircle } from "lucide-react";
import { Facebook, Twitter } from "@/components/ui/SocialIcons";
import { cn, formatBDT } from "@/lib/utils";
import { Rating } from "@/components/ui/Rating";
import { useStore } from "@/components/providers/AppProviders";
import type { ProductDetail } from "@/lib/queries";

/**
 * Product gallery + purchase panel — the interactive heart of the PDP.
 */
export function ProductPurchase({ product }: { product: ProductDetail }) {
  const { addToCart, toggleWishlist, wishlistIds, toast, openCart } = useStore();
  const [selectedImage, setSelectedImage] = useState(0);
  const [color, setColor] = useState<string | null>(product.colors[0] ?? null);
  const [size, setSize] = useState<string | null>(product.sizes[0] ?? null);
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [zoom, setZoom] = useState<{ active: boolean; x: number; y: number }>({
    active: false,
    x: 50,
    y: 50,
  });

  const wished = wishlistIds.includes(product.id);
  const hasVariants = product.colors.length > 0 || product.sizes.length > 0;

  // Resolve the matching variant for the current selection.
  const variant = useMemo(() => {
    if (!product.variants.length) return null;
    return (
      product.variants.find(
        (v) =>
          (!color || v.color === color) &&
          (!size || v.size === size)
      ) ??
      product.variants.find((v) => (color ? v.color === color : true) && (size ? v.size === size : true)) ??
      null
    );
  }, [product.variants, color, size]);

  const unitPrice = variant?.price != null ? Number(variant.price) : product.price;
  const compareAt = product.compareAtPrice;
  const discountPercent =
    product.discountPercent ||
    (compareAt && compareAt > unitPrice ? Math.round(((compareAt - unitPrice) / compareAt) * 100) : 0);

  const stockLeft = variant ? variant.stock : product.stock;
  const inStock = stockLeft > 0;
  const maxQty = Math.max(1, Math.min(stockLeft, 99));

  useEffect(() => {
    if (quantity > maxQty) setQuantity(maxQty);
  }, [maxQty, quantity]);

  // Track the view for "recently viewed".
  useEffect(() => {
    fetch("/api/recently-viewed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: product.id }),
    }).catch(() => undefined);
  }, [product.id]);

  const requiresSelection =
    hasVariants && (!product.colors.length || !color ? true : false) ||
    (hasVariants && product.sizes.length > 0 && !size);

  const handleAdd = async (buyNow = false) => {
    if (!inStock) return;
    if (hasVariants && ((product.colors.length > 0 && !color) || (product.sizes.length > 0 && !size))) {
      toast(`Please select ${product.colors.length && !color ? "a color" : "a size"}`, "error");
      return;
    }
    setAdding(true);
    const ok = await addToCart({
      productId: product.id,
      variantId: variant?.id ?? null,
      color,
      size,
      quantity,
    });
    setAdding(false);
    if (ok && buyNow) {
      window.location.href = "/checkout";
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast("Link copied", "success");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Could not copy link", "error");
    }
  };

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const shareText = encodeURIComponent(`Check out ${product.name} on Imalissa`);

  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
      {/* ── Gallery ─────────────────────────────────────── */}
      <div className="flex flex-col-reverse gap-4 sm:flex-row">
        {/* Thumbnails */}
        <div className="flex gap-3 sm:flex-col">
          {product.images.map((img, i) => (
            <button
              key={img.id}
              onClick={() => setSelectedImage(i)}
              aria-label={`View image ${i + 1}`}
              className={cn(
                "relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border transition-all sm:h-20 sm:w-20",
                selectedImage === i
                  ? "border-gold-500/70 shadow-[0_0_0_3px_rgba(212,175,55,0.15)]"
                  : "border-white/10 opacity-60 hover:opacity-100"
              )}
            >
              {img.url.endsWith(".svg") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img.url} alt="" className="h-full w-full object-cover" />
              ) : (
                <Image src={img.url} alt="" fill sizes="80px" className="object-cover" />
              )}
            </button>
          ))}
        </div>

        {/* Main image + zoom */}
        <div
          className="relative flex-1 overflow-hidden rounded-2xl border border-white/[0.08] bg-ink-850"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setZoom({
              active: true,
              x: ((e.clientX - rect.left) / rect.width) * 100,
              y: ((e.clientY - rect.top) / rect.height) * 100,
            });
          }}
          onMouseLeave={() => setZoom((z) => ({ ...z, active: false }))}
        >
          <div className="aspect-square w-full">
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedImage}
                initial={{ opacity: 0, scale: 1.02 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="h-full w-full"
                style={
                  zoom.active
                    ? {
                        transform: "scale(1.8)",
                        transformOrigin: `${zoom.x}% ${zoom.y}%`,
                        transition: "transform 0.15s ease-out",
                      }
                    : { transition: "transform 0.4s ease" }
                }
              >
                {product.images[selectedImage]?.url.endsWith(".svg") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.images[selectedImage]?.url ?? ""}
                    alt={product.images[selectedImage]?.alt ?? product.name}
                    className="h-full w-full object-cover"
                  />
                ) : product.images[selectedImage] ? (
                  <Image
                    src={product.images[selectedImage].url}
                    alt={product.images[selectedImage].alt ?? product.name}
                    fill
                    priority
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className="object-cover"
                  />
                ) : null}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Badges */}
          <div className="absolute left-4 top-4 flex flex-col gap-2">
            {discountPercent > 0 && (
              <span className="rounded-lg bg-gradient-to-br from-gold-400 to-gold-600 px-3 py-1 text-[0.72rem] font-bold text-ink-950 shadow">
                -{discountPercent}%
              </span>
            )}
            {product.newArrival && (
              <span className="rounded-lg bg-emerald-500 px-3 py-1 text-[0.72rem] font-bold text-white shadow">
                New
              </span>
            )}
            {product.isBestseller && (
              <span className="rounded-lg bg-rose-500 px-3 py-1 text-[0.72rem] font-bold text-white shadow">
                Bestseller
              </span>
            )}
          </div>

          <p className="absolute bottom-3 right-3 rounded-md bg-ink-950/70 px-2 py-1 text-[0.62rem] text-mist-400 backdrop-blur">
            Hover to zoom
          </p>
        </div>
      </div>

      {/* ── Info panel ──────────────────────────────────── */}
      <div className="flex flex-col gap-5">
        <div>
          <div className="flex items-center gap-3 text-[0.7rem] font-semibold uppercase tracking-[0.18em]">
            <span className="text-gold-500">{product.brand?.name ?? product.category.name}</span>
            <span className="text-mist-600">SKU: {product.sku}</span>
          </div>
          <h1 className="mt-2 font-display text-[1.7rem] font-bold leading-tight text-mist-50 sm:text-[2.1rem]">
            {product.name}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Rating value={product.rating} count={product.reviewCount} size={15} showValue />
            <span className="text-[0.76rem] text-mist-500">
              {product.soldCount} sold
            </span>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[0.68rem] font-semibold",
                inStock ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
              )}
            >
              {inStock ? (stockLeft <= 5 ? `Only ${stockLeft} left` : "In Stock") : "Out of Stock"}
            </span>
          </div>
        </div>

        <div className="divider-gold" />

        {/* Price */}
        <div className="glass-gold rounded-2xl px-5 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <span className="font-display text-[2.2rem] font-bold leading-none text-gold-gradient">
              {formatBDT(unitPrice)}
            </span>
            {compareAt && compareAt > unitPrice && (
              <span className="pb-1 text-lg text-mist-500 line-through">
                {formatBDT(compareAt)}
              </span>
            )}
            {discountPercent > 0 && (
              <span className="mb-1 rounded-md bg-success/15 px-2 py-0.5 text-[0.74rem] font-bold text-success">
                Save {formatBDT(compareAt! - unitPrice)}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[0.74rem] text-mist-400">
            Inclusive of all taxes • Cash on Delivery available
          </p>
        </div>

        {/* Color */}
        {product.colors.length > 0 && (
          <div>
            <p className="mb-2 text-[0.78rem] font-semibold text-mist-300">
              Color: <span className="text-gold-300">{color ?? "Select"}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {product.colors.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    "rounded-xl border px-4 py-2 text-[0.82rem] transition-all",
                    color === c
                      ? "border-gold-500/70 bg-gold-500/15 text-gold-200 shadow-[0_0_0_3px_rgba(212,175,55,0.12)]"
                      : "border-white/10 bg-white/[0.03] text-mist-300 hover:border-gold-500/40"
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Size */}
        {product.sizes.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[0.78rem] font-semibold text-mist-300">
                Size: <span className="text-gold-300">{size ?? "Select"}</span>
              </p>
              <span className="text-[0.7rem] text-mist-500">Size guide</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {product.sizes.map((s) => {
                const available = product.variants.some(
                  (v) => v.size === s && v.stock > 0 && (!color || v.color === color)
                );
                return (
                  <button
                    key={s}
                    onClick={() => available && setSize(s)}
                    disabled={!available}
                    className={cn(
                      "min-w-12 rounded-xl border px-4 py-2 text-[0.82rem] transition-all",
                      size === s
                        ? "border-gold-500/70 bg-gold-500/15 text-gold-200 shadow-[0_0_0_3px_rgba(212,175,55,0.12)]"
                        : available
                          ? "border-white/10 bg-white/[0.03] text-mist-300 hover:border-gold-500/40"
                          : "cursor-not-allowed border-white/[0.05] bg-white/[0.02] text-mist-700 line-through"
                    )}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Quantity + actions */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-xl border border-white/12 bg-ink-850">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              aria-label="Decrease quantity"
              className="px-3.5 py-3 text-mist-400 transition hover:text-gold-300 disabled:opacity-40"
            >
              <Minus size={16} />
            </button>
            <span className="min-w-10 text-center text-[0.95rem] font-semibold">{quantity}</span>
            <button
              onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
              disabled={quantity >= maxQty}
              aria-label="Increase quantity"
              className="px-3.5 py-3 text-mist-400 transition hover:text-gold-300 disabled:opacity-40"
            >
              <Plus size={16} />
            </button>
          </div>

          <button
            onClick={() => handleAdd(false)}
            disabled={!inStock || adding}
            className="btn-outline-gold flex flex-1 items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm min-w-40"
          >
            <ShoppingBag size={17} />
            {adding ? "Adding…" : "Add to Cart"}
          </button>

          <button
            onClick={() => handleAdd(true)}
            disabled={!inStock || adding}
            className="btn-gold flex flex-1 items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm min-w-40"
          >
            <Zap size={17} />
            Buy Now
          </button>
        </div>

        {/* Wishlist + share */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => toggleWishlist(product.id)}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[0.82rem] transition",
              wished
                ? "border-gold-500/60 bg-gold-500/10 text-gold-300"
                : "border-white/10 text-mist-300 hover:border-gold-500/40 hover:text-gold-300"
            )}
          >
            <Heart size={15} fill={wished ? "currentColor" : "none"} />
            {wished ? "Saved to Wishlist" : "Add to Wishlist"}
          </button>

          <div className="relative">
            <button
              onClick={() => setShareOpen((v) => !v)}
              className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-[0.82rem] text-mist-300 transition hover:border-gold-500/40 hover:text-gold-300"
            >
              <Share2 size={15} /> Share
            </button>
            <AnimatePresence>
              {shareOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.96 }}
                  className="absolute left-0 top-full z-30 mt-2 flex gap-2 rounded-xl border border-white/10 bg-ink-850 p-2 shadow-lift"
                >
                  <a
                    href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Share on Facebook"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-mist-300 transition hover:border-gold-500/40 hover:text-gold-300"
                  >
                    <Facebook size={15} />
                  </a>
                  <a
                    href={`https://twitter.com/intent/tweet?text=${shareText}&url=${encodeURIComponent(shareUrl)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Share on X"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-mist-300 transition hover:border-gold-500/40 hover:text-gold-300"
                  >
                    <Twitter size={15} />
                  </a>
                  <a
                    href={`https://wa.me/?text=${shareText}%20${encodeURIComponent(shareUrl)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Share on WhatsApp"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-mist-300 transition hover:border-gold-500/40 hover:text-gold-300"
                  >
                    <MessageCircle size={15} />
                  </a>
                  <button
                    onClick={copyLink}
                    aria-label="Copy link"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-mist-300 transition hover:border-gold-500/40 hover:text-gold-300"
                  >
                    {copied ? <Check size={15} className="text-success" /> : <Copy size={15} />}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Micro trust points */}
        <div className="grid grid-cols-1 gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 text-[0.78rem] text-mist-400 sm:grid-cols-2">
          <p className="flex items-center gap-2">
            <span className="text-gold-500">✓</span> 100% authentic products
          </p>
          <p className="flex items-center gap-2">
            <span className="text-gold-500">✓</span> Cash on Delivery nationwide
          </p>
          <p className="flex items-center gap-2">
            <span className="text-gold-500">✓</span> 7-day easy returns
          </p>
          <p className="flex items-center gap-2">
            <span className="text-gold-500">✓</span> Delivery in 2–5 days
          </p>
        </div>
      </div>
    </div>
  );
}
