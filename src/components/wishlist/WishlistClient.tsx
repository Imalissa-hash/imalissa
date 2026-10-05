"use client";

import { useEffect, useRef, useState } from "react";
import { Heart } from "lucide-react";
import { useStore } from "@/components/providers/AppProviders";
import { ProductCard, ProductCardSkeleton } from "@/components/ui/ProductCard";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ProductCardData } from "@/types/store";

/**
 * Wishlist grid.
 * Initial list comes from the server (?full=1); afterwards the global
 * wishlist ids are the source of truth, so un-hearting a product on any
 * card removes it from this view instantly.
 */
export function WishlistClient() {
  const { wishlistIds, user } = useStore();
  const [items, setItems] = useState<ProductCardData[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const prevIds = useRef<string[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/wishlist?full=1");
        const json = await res.json();
        if (!alive) return;
        if (json.ok) {
          setItems(json.data as ProductCardData[]);
          prevIds.current = (json.data as ProductCardData[]).map((i) => i.id);
        } else if (res.status === 401) {
          setItems([]);
        } else {
          setError(json.message ?? "Could not load your wishlist");
          setItems([]);
        }
      } catch {
        if (alive) setError("Network error — please try again");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Sync removals made through any heart button.
  useEffect(() => {
    const signature = wishlistIds.join(",");
    if (prevIds.current === null) {
      prevIds.current = wishlistIds;
      return;
    }
    if (prevIds.current.join(",") !== signature) {
      prevIds.current = wishlistIds;
      setItems((list) => (list ? list.filter((i) => wishlistIds.includes(i.id)) : list));
    }
  }, [wishlistIds]);

  if (items === null) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {[...Array(8)].map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="Something went wrong"
        description={error}
        actionLabel="Try again"
        actionHref="/wishlist"
        icon={<Heart size={26} />}
      />
    );
  }

  if (items.length === 0) {
    return user ? (
      <EmptyState
        title="Your wishlist is empty"
        description="Tap the heart on any product to save it here for later."
        actionLabel="Discover products"
        actionHref="/search"
        icon={<Heart size={26} />}
      />
    ) : (
      <EmptyState
        title="Save your favourites"
        description="Sign in to build a wishlist you can come back to — and sync across devices."
        actionLabel="Sign in"
        actionHref="/auth/login?next=/wishlist"
        icon={<Heart size={26} />}
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((p, i) => (
        <ProductCard key={p.id} product={p} index={i} />
      ))}
    </div>
  );
}
