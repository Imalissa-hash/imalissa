import { ProductCardSkeleton } from "@/components/ui/ProductCard";

/**
 * Route-level loading state for the storefront — shows instantly on
 * navigation instead of a blank screen while the server renders.
 * (Layout/header stay mounted; only the page segment is replaced.)
 */
export default function StorefrontLoading() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="skeleton h-8 w-56 rounded-lg" />
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
