"use client";

import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Minus, Plus, ShoppingBag, Trash2, X, ArrowRight, Heart } from "lucide-react";
import { useStore } from "@/components/providers/AppProviders";
import { formatBDT } from "@/lib/utils";

/**
 * Slide-in cart drawer — animated, always reflects server-side cart state.
 */
export function CartDrawer() {
  const {
    cart,
    cartOpen,
    closeCart,
    updateCartItem,
    removeCartItem,
    moveToWishlist,
    cartLoading,
  } = useStore();

  const items = cart?.items ?? [];
  const subtotal = cart?.subtotal ?? 0;

  return (
    <AnimatePresence>
      {cartOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeCart}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            aria-hidden
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="fixed inset-y-0 right-0 z-50 flex w-[92%] max-w-md flex-col border-l border-gold-500/20 bg-ink-900 shadow-lift"
            role="dialog"
            aria-label="Shopping cart"
          >
            <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
              <h2 className="flex items-center gap-2.5 font-display text-lg font-semibold text-gold-gradient">
                <ShoppingBag size={18} className="text-gold-500" />
                Your Cart
                <span className="rounded-full bg-gold-500/15 px-2 py-0.5 text-[0.7rem] font-sans font-semibold text-gold-300">
                  {cart?.itemCount ?? 0}
                </span>
              </h2>
              <button
                onClick={closeCart}
                aria-label="Close cart"
                className="rounded-lg p-2 text-mist-400 transition hover:bg-white/[0.06] hover:text-mist-100"
              >
                <X size={19} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
              {cartLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="skeleton h-20 w-20 rounded-xl" />
                      <div className="flex-1 space-y-2 py-1">
                        <div className="skeleton h-4 w-3/4 rounded" />
                        <div className="skeleton h-3 w-1/2 rounded" />
                        <div className="skeleton h-4 w-20 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : items.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full border border-gold-500/25 bg-gold-500/[0.06]">
                    <ShoppingBag size={30} className="text-gold-500/70" />
                  </div>
                  <div>
                    <p className="font-display text-lg text-mist-100">Your cart is empty</p>
                    <p className="mt-1 text-sm text-mist-500">
                      Explore our collection and find something you love.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      closeCart();
                      window.location.href = "/search";
                    }}
                    className="btn-gold rounded-xl px-6 py-2.5 text-sm"
                  >
                    Start Shopping
                  </button>
                </div>
              ) : (
                <ul className="space-y-3">
                  <AnimatePresence initial={false}>
                    {items.map((item) => (
                      <motion.li
                        key={item.id}
                        layout
                        initial={{ opacity: 0, x: 24 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 24, height: 0, marginBottom: 0 }}
                        transition={{ type: "spring", stiffness: 400, damping: 32 }}
                        className="flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition hover:border-gold-500/25"
                      >
                        <Link
                          href={`/product/${item.slug}`}
                          onClick={closeCart}
                          className="relative h-[76px] w-[76px] shrink-0 overflow-hidden rounded-lg border border-white/[0.07] bg-ink-800"
                        >
                          {item.image?.endsWith(".svg") || item.image?.startsWith("/") ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.image ?? ""}
                              alt={item.name}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : item.image ? (
                            <Image src={item.image} alt={item.name} fill sizes="76px" className="object-cover" />
                          ) : null}
                        </Link>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-2">
                            <Link
                              href={`/product/${item.slug}`}
                              onClick={closeCart}
                              className="line-clamp-2 flex-1 text-[0.84rem] font-medium leading-snug text-mist-100 transition hover:text-gold-300"
                            >
                              {item.name}
                            </Link>
                            <button
                              onClick={() => removeCartItem(item.id)}
                              aria-label={`Remove ${item.name}`}
                              className="rounded p-1 text-mist-600 transition hover:text-danger"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>

                          {item.variantLabel && (
                            <p className="mt-0.5 text-[0.7rem] text-mist-500">{item.variantLabel}</p>
                          )}

                          <div className="mt-2 flex items-center justify-between gap-2">
                            <div className="flex items-center rounded-lg border border-white/10 bg-ink-850">
                              <button
                                onClick={() => updateCartItem(item.id, item.quantity - 1)}
                                aria-label="Decrease quantity"
                                className="px-2 py-1.5 text-mist-400 transition hover:text-gold-300 disabled:opacity-40"
                                disabled={item.quantity <= 1}
                              >
                                <Minus size={13} />
                              </button>
                              <span className="min-w-7 text-center text-[0.8rem] font-semibold text-mist-100">
                                {item.quantity}
                              </span>
                              <button
                                onClick={() => updateCartItem(item.id, item.quantity + 1)}
                                aria-label="Increase quantity"
                                disabled={item.quantity >= item.maxQuantity}
                                className="px-2 py-1.5 text-mist-400 transition hover:text-gold-300 disabled:opacity-40"
                              >
                                <Plus size={13} />
                              </button>
                            </div>
                            <div className="text-right">
                              <p className="text-[0.9rem] font-semibold text-gold-300">
                                {formatBDT(item.lineTotal)}
                              </p>
                              {item.compareAtPrice && item.compareAtPrice > item.unitPrice && (
                                <p className="text-[0.68rem] text-mist-600 line-through">
                                  {formatBDT(item.compareAtPrice * item.quantity)}
                                </p>
                              )}
                            </div>
                          </div>

                          <button
                            onClick={() => moveToWishlist(item.id)}
                            className="mt-1.5 flex items-center gap-1 text-[0.68rem] text-mist-500 transition hover:text-gold-400"
                          >
                            <Heart size={11} /> Save for later
                          </button>
                        </div>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </div>

            {items.length > 0 && (
              <div className="border-t border-gold-500/15 bg-ink-850 px-5 py-4">
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-mist-400">Subtotal</span>
                  <span className="font-display text-xl font-semibold text-gold-gradient">
                    {formatBDT(subtotal)}
                  </span>
                </div>
                {cart && cart.savings > 0 && (
                  <p className="mb-2 text-[0.72rem] text-success">You save {formatBDT(cart.savings)} 🎉</p>
                )}
                <p className="mb-3 text-[0.7rem] text-mist-500">
                  Delivery charge calculated at checkout.
                </p>
                <div className="flex gap-2">
                  <Link
                    href="/cart"
                    onClick={closeCart}
                    className="btn-outline-gold flex-1 rounded-xl py-3 text-center text-sm"
                  >
                    View Cart
                  </Link>
                  <Link
                    href="/checkout"
                    onClick={closeCart}
                    className="btn-gold flex flex-[1.4] items-center justify-center gap-2 rounded-xl py-3 text-sm"
                  >
                    Checkout <ArrowRight size={15} />
                  </Link>
                </div>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
