"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CartState, SessionUser } from "@/types/store";

/**
 * Global storefront state:
 *  - cart (fetched from server, kept in sync after every mutation)
 *  - wishlist ids
 *  - cart drawer visibility
 *  - toast notifications
 */

export interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

interface StoreContextValue {
  cart: CartState | null;
  cartLoading: boolean;
  wishlistIds: string[];
  user: SessionUser | null;
  /**
   * True once the initial /api/auth/me lookup has settled. Pages that gate on
   * auth (e.g. checkout → redirect to login) must wait for this so a logged-in
   * user isn't bounced to /auth/login before their session resolves.
   */
  userLoaded: boolean;
  cartOpen: boolean;
  toasts: Toast[];

  openCart: () => void;
  closeCart: () => void;
  refreshCart: () => Promise<void>;
  refreshWishlist: () => Promise<void>;
  setUser: (u: SessionUser | null) => void;

  addToCart: (input: {
    productId: string;
    variantId?: string | null;
    color?: string | null;
    size?: string | null;
    quantity?: number;
  }) => Promise<boolean>;
  updateCartItem: (itemId: string, quantity: number) => Promise<boolean>;
  removeCartItem: (itemId: string) => Promise<boolean>;
  moveToWishlist: (itemId: string) => Promise<boolean>;
  applyCoupon: (code: string | null) => Promise<boolean>;

  toggleWishlist: (productId: string) => Promise<boolean>;

  toast: (message: string, type?: Toast["type"]) => void;
  dismissToast: (id: number) => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

const emptyCart: CartState = { items: [], subtotal: 0, savings: 0, itemCount: 0, couponCode: null };

async function api<T>(
  url: string,
  options?: RequestInit
): Promise<{ ok: boolean; data?: T; message?: string }> {
  try {
    const res = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    });
    const json = await res.json().catch(() => ({ ok: false, message: "Invalid server response" }));
    return json as { ok: boolean; data?: T; message?: string };
  } catch {
    return { ok: false, message: "Network error — please try again" };
  }
}

export function AppProviders({
  children,
  initialUser = null,
}: {
  children: React.ReactNode;
  initialUser?: SessionUser | null;
}) {
  const [cart, setCart] = useState<CartState | null>(null);
  const [cartLoading, setCartLoading] = useState(true);
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [user, setUser] = useState<SessionUser | null>(initialUser);
  const [userLoaded, setUserLoaded] = useState<boolean>(Boolean(initialUser));
  const [cartOpen, setCartOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const toast = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const refreshCart = useCallback(async () => {
    const res = await api<CartState>("/api/cart");
    if (res.ok && res.data) setCart(res.data);
    else setCart((c) => c ?? emptyCart);
  }, []);

  const refreshWishlist = useCallback(async () => {
    const res = await api<string[]>("/api/wishlist");
    if (res.ok && Array.isArray(res.data)) setWishlistIds(res.data);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setCartLoading(true);
      await Promise.all([refreshCart(), refreshWishlist()]);
      if (alive) setCartLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [refreshCart, refreshWishlist]);

  // Keep user state fresh (after login/logout navigations).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api<SessionUser | null>("/api/auth/me");
        if (alive && res.ok) setUser(res.data ?? null);
      } finally {
        if (alive) setUserLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const addToCart = useCallback<StoreContextValue["addToCart"]>(
    async (input) => {
      const res = await api<CartState>("/api/cart", {
        method: "POST",
        body: JSON.stringify(input),
      });
      if (res.ok && res.data) {
        setCart(res.data);
        setCartOpen(true);
        toast("Added to cart", "success");
        return true;
      }
      toast(res.message ?? "Could not add to cart", "error");
      return false;
    },
    [toast]
  );

  const updateCartItem = useCallback<StoreContextValue["updateCartItem"]>(
    async (itemId, quantity) => {
      const res = await api<CartState>("/api/cart", {
        method: "PATCH",
        body: JSON.stringify({ itemId, quantity }),
      });
      if (res.ok && res.data) {
        setCart(res.data);
        return true;
      }
      toast(res.message ?? "Could not update cart", "error");
      return false;
    },
    [toast]
  );

  const removeCartItem = useCallback<StoreContextValue["removeCartItem"]>(
    async (itemId) => {
      const res = await api<CartState>(`/api/cart?itemId=${encodeURIComponent(itemId)}`, {
        method: "DELETE",
      });
      if (res.ok && res.data) {
        setCart(res.data);
        toast("Removed from cart", "info");
        return true;
      }
      toast(res.message ?? "Could not remove item", "error");
      return false;
    },
    [toast]
  );

  const moveToWishlist = useCallback<StoreContextValue["moveToWishlist"]>(
    async (itemId) => {
      const res = await api<{ cart: CartState; productId: string }>("/api/cart/move-to-wishlist", {
        method: "POST",
        body: JSON.stringify({ itemId }),
      });
      if (res.ok && res.data) {
        setCart(res.data.cart);
        setWishlistIds((w) => (w.includes(res.data!.productId) ? w : [...w, res.data!.productId]));
        toast("Moved to wishlist", "success");
        return true;
      }
      toast(res.message ?? "Could not move item", "error");
      return false;
    },
    [toast]
  );

  const applyCoupon = useCallback<StoreContextValue["applyCoupon"]>(
    async (code) => {
      const res = await api<CartState>("/api/cart/coupon", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      if (res.ok && res.data) {
        setCart(res.data);
        toast(code ? `Coupon ${code} applied` : "Coupon removed", "success");
        return true;
      }
      toast(res.message ?? "Invalid coupon", "error");
      return false;
    },
    [toast]
  );

  const toggleWishlist = useCallback<StoreContextValue["toggleWishlist"]>(
    async (productId) => {
      const has = wishlistIds.includes(productId);
      const res = await api<{ active: boolean }>("/api/wishlist", {
        method: "POST",
        body: JSON.stringify({ productId }),
      });
      if (res.ok && res.data) {
        setWishlistIds((w) =>
          res.data!.active ? (w.includes(productId) ? w : [...w, productId]) : w.filter((id) => id !== productId)
        );
        toast(res.data.active ? "Saved to wishlist" : "Removed from wishlist", "success");
        return true;
      }
      toast(res.message ?? "Please log in to use your wishlist", "error");
      return false;
    },
    [wishlistIds, toast]
  );

  const value = useMemo<StoreContextValue>(
    () => ({
      cart: cart ?? emptyCart,
      cartLoading,
      wishlistIds,
      user,
      userLoaded,
      cartOpen,
      toasts,
      openCart: () => setCartOpen(true),
      closeCart: () => setCartOpen(false),
      refreshCart,
      refreshWishlist,
      setUser,
      addToCart,
      updateCartItem,
      removeCartItem,
      moveToWishlist,
      applyCoupon,
      toggleWishlist,
      toast,
      dismissToast,
    }),
    [
      cart,
      cartLoading,
      wishlistIds,
      user,
      userLoaded,
      cartOpen,
      toasts,
      refreshCart,
      refreshWishlist,
      addToCart,
      updateCartItem,
      removeCartItem,
      moveToWishlist,
      applyCoupon,
      toggleWishlist,
      toast,
      dismissToast,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within AppProviders");
  return ctx;
}
