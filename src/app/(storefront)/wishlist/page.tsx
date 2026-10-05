import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { WishlistClient } from "@/components/wishlist/WishlistClient";

export const metadata: Metadata = {
  title: "My Wishlist",
  description: "Your saved Imalissa products — pick up where you left off.",
  robots: { index: false },
};

export default function WishlistPage() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      <Breadcrumbs items={[{ label: "Wishlist" }]} />
      <div className="mb-6 mt-3">
        <h1 className="font-display text-3xl font-bold text-mist-50">
          My <span className="text-gold-gradient">Wishlist</span>
        </h1>
        <p className="mt-1 text-sm text-mist-500">
          Everything you&apos;ve saved, in one place.
        </p>
      </div>
      <WishlistClient />
    </div>
  );
}
