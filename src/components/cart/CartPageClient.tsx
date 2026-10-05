"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Heart,
  Minus,
  Plus,
  ShoppingBag,
  Tag,
  Trash2,
  X,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { useStore } from "@/components/providers/AppProviders";
import { formatBDT } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Full cart page — quantity steppers, coupon, save-for-later, totals.
 * All mutations go to the server; totals shown are server-priced.
 */
export function CartPageClient() {
  const {
    cart,
    cartLoading,
    updateCartItem,
    removeCartItem,
    moveToWishlist,
    applyCoupon,
    toast,
  } = useStore();

  const [couponInput, setCouponInput] = useState(cart?.couponCode ?? "");
  const [applying, setApplying] = useState(false);

  const items = cart?.items ?? [];
  const subtotal = cart?.subtotal ?? 0;

  const apply = async () => {
    setApplying(true);
    await applyCoupon(couponInput.trim() ? couponInput.trim().toUpperCase() : null);
    setApplying(false);
  };

  if (!cartLoading && items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState
          title="Your cart is empty"
          description="Looks like you haven't added anything yet. Explore our collections and find something you love."
          actionLabel="Start Shopping"
          actionHref="/search"
          icon={<ShoppingBag size={26} />}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold text-mist-50">
          Shopping Cart{" "}
          <span className="ml-1 text-lg font-normal text-gold-400">
            ({cart?.itemCount ?? 0} items)
          </span>
        </h1>
        <Link
          href="/search"
          className="text-[0.84rem] text-gold-400 transition hover:text-gold-300"
        >
          Continue shopping →
        </Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        {/* ── Items ─────────────────────────────────────── */}
        <div className="space-y-4">
          {cartLoading
            ? [...Array(3)].map((_, i) => <div key={i} className="skeleton h-32 rounded-2xl" />)
            : items.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 transition hover:border-gold-500/25"
                >
                  <Link
                    href={`/product/${item.slug}`}
                    className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-white/[0.08] bg-ink-800 sm:h-28 sm:w-28"
                  >
                    {item.image ? (
                      item.image.endsWith(".svg") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                      ) : (
                        <Image src={item.image} alt={item.name} fill sizes="112px" className="object-cover" />
                      )
                    ) : null}
                  </Link>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/product/${item.slug}`}
                          className="line-clamp-2 text-[0.95rem] font-medium text-mist-100 transition hover:text-gold-300"
                        >
                          {item.name}
                        </Link>
                        <p className="mt-0.5 text-[0.72rem] text-mist-600">SKU: {item.sku}</p>
                        {item.variantLabel && (
                          <p className="mt-1 inline-block rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[0.72rem] text-mist-300">
                            {item.variantLabel}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => removeCartItem(item.id)}
                        aria-label={`Remove ${item.name}`}
                        className="rounded-lg p-2 text-mist-600 transition hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-3">
                      <div className="flex items-center rounded-xl border border-white/10 bg-ink-850">
                        <button
                          onClick={() => updateCartItem(item.id, item.quantity - 1)}
                          disabled={item.quantity <= 1}
                          aria-label="Decrease"
                          className="px-3 py-2 text-mist-400 transition hover:text-gold-300 disabled:opacity-40"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="min-w-8 text-center text-sm font-semibold">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateCartItem(item.id, item.quantity + 1)}
                          disabled={item.quantity >= item.maxQuantity}
                          aria-label="Increase"
                          className="px-3 py-2 text-mist-400 transition hover:text-gold-300 disabled:opacity-40"
                        >
                          <Plus size={14} />
                        </button>
                      </div>

                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => moveToWishlist(item.id)}
                          className="flex items-center gap-1.5 text-[0.76rem] text-mist-500 transition hover:text-gold-400"
                        >
                          <Heart size={13} /> Save for later
                        </button>
                        <div className="text-right">
                          <p className="font-display text-lg font-semibold text-gold-300">
                            {formatBDT(item.lineTotal)}
                          </p>
                          {item.compareAtPrice && item.compareAtPrice > item.unitPrice && (
                            <p className="text-[0.72rem] text-mist-600 line-through">
                              {formatBDT(item.compareAtPrice * item.quantity)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
        </div>

        {/* ── Summary ───────────────────────────────────── */}
        <aside className="lg:sticky lg:top-36 lg:h-fit">
          <div className="rounded-2xl border border-gold-500/20 bg-gradient-to-b from-ink-800 to-ink-900 p-6 shadow-lift">
            <h2 className="font-display text-xl font-semibold text-gold-gradient">Order Summary</h2>

            {/* Coupon */}
            <div className="mt-5">
              <label className="mb-2 block text-[0.78rem] font-semibold text-mist-300">
                Coupon code
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Tag
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gold-500"
                  />
                  <input
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    placeholder="e.g. WELCOME10"
                    className="input-premium !py-2.5 pl-9 text-[0.84rem] uppercase tracking-wide"
                  />
                </div>
                <button
                  onClick={apply}
                  disabled={applying}
                  className="btn-outline-gold rounded-xl px-4 py-2.5 text-[0.8rem] disabled:opacity-50"
                >
                  {applying ? "…" : "Apply"}
                </button>
              </div>
              {cart?.couponCode && (
                <p className="mt-2 flex items-center justify-between rounded-lg border border-success/30 bg-success/10 px-3 py-1.5 text-[0.76rem] text-success">
                  <span>
                    <strong>{cart.couponCode}</strong> applied
                  </span>
                  <button
                    onClick={() => {
                      setCouponInput("");
                      applyCoupon(null);
                    }}
                    className="flex items-center gap-1 text-mist-400 hover:text-danger"
                  >
                    <X size={12} /> remove
                  </button>
                </p>
              )}
            </div>

            <div className="divider-gold my-5" />

            <div className="space-y-3 text-[0.88rem]">
              <div className="flex justify-between text-mist-400">
                <span>Subtotal</span>
                <span className="text-mist-100">{formatBDT(subtotal)}</span>
              </div>
              {cart && cart.savings > 0 && (
                <div className="flex justify-between text-success">
                  <span>You save</span>
                  <span>-{formatBDT(cart.savings)}</span>
                </div>
              )}
              <div className="flex justify-between text-mist-400">
                <span>Delivery charge</span>
                <span className="text-mist-200">Calculated at checkout</span>
              </div>
              <div className="divider-gold" />
              <div className="flex items-end justify-between">
                <span className="font-semibold text-mist-200">Total</span>
                <span className="font-display text-2xl font-bold text-gold-gradient">
                  {formatBDT(subtotal)}
                </span>
              </div>
            </div>

            <Link
              href="/checkout"
              className="btn-gold mt-6 flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm"
            >
              Proceed to Checkout <ArrowRight size={16} />
            </Link>

            <Link
              href="/search"
              className="mt-3 block text-center text-[0.8rem] text-mist-500 transition hover:text-gold-400"
            >
              Continue shopping
            </Link>

            <div className="mt-5 space-y-2 border-t border-white/[0.07] pt-4 text-[0.74rem] text-mist-500">
              <p className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-gold-500" /> Secure checkout — your data
                stays private
              </p>
              <p className="flex items-center gap-2">
                <Truck size={14} className="text-gold-500" /> Free delivery on orders over ৳3,000
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
