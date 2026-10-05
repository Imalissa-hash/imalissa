import { Suspense } from "react";
import Link from "next/link";
import { ProductCard, ProductCardSkeleton } from "@/components/ui/ProductCard";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterSidebar, type FilterContext } from "@/components/shop/FilterSidebar";
import { SortSelect } from "@/components/shop/SortSelect";
import { searchProducts, type SearchResult, type SortKey } from "@/lib/queries";
import { Breadcrumbs, type Crumb } from "@/components/ui/Breadcrumbs";

export interface ListingQuery {
  q?: string;
  categorySlug?: string;
  brand?: string;
  color?: string;
  size?: string;
  min?: string;
  max?: string;
  rating?: string;
  stock?: string;
  discount?: string;
  sort?: string;
  page?: string;
}

/**
 * Shared product-listing renderer used by /search and /c/[slug].
 * Server-side filtering + pagination (shareable URLs, SEO-friendly).
 */
export async function ProductListing({
  query,
  basePath,
  crumbs,
  heading,
  headingNote,
  filterContext,
  emptyTitle,
  emptyDescription,
}: {
  query: ListingQuery;
  basePath: string;
  crumbs: Crumb[];
  heading: string;
  headingNote?: string;
  filterContext: FilterContext;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const page = Math.max(1, Number(query.page ?? 1));
  const result: SearchResult = await searchProducts({
    q: query.q,
    categorySlug: query.categorySlug,
    brandSlugs: query.brand?.split(",").filter(Boolean),
    minPrice: query.min ? Number(query.min) : undefined,
    maxPrice: query.max ? Number(query.max) : undefined,
    minRating: query.rating ? Number(query.rating) : undefined,
    inStock: query.stock === "1",
    minDiscount: query.discount ? Number(query.discount) : undefined,
    color: query.color?.split(",")[0],
    size: query.size?.split(",")[0],
    sort: (query.sort as SortKey) ?? "relevance",
    page,
    pageSize: 12,
  });

  const totalPages = Math.max(1, Math.ceil(result.total / 12));

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      <Breadcrumbs items={crumbs} />

      <div className="mt-5 mb-6">
        <h1 className="font-display text-3xl font-bold text-mist-50">{heading}</h1>
        <p className="mt-1.5 text-sm text-mist-500">
          {headingNote ?? `${result.total} product${result.total === 1 ? "" : "s"} found`}
          {query.q && <> for “<span className="text-gold-300">{query.q}</span>”</>}
        </p>
      </div>

      <div className="flex gap-8">
        <FilterSidebar context={filterContext} />

        <div className="min-w-0 flex-1">
          <div className="mb-5 flex items-center justify-between gap-3">
            <p className="text-[0.8rem] text-mist-500">
              Showing{" "}
              <span className="text-mist-200">
                {(page - 1) * 12 + 1}–{Math.min(page * 12, result.total)}
              </span>{" "}
              of <span className="text-mist-200">{result.total}</span>
            </p>
            <Suspense fallback={null}>
              <SortSelect />
            </Suspense>
          </div>

          {result.items.length === 0 ? (
            <EmptyState
              title={emptyTitle ?? "No products found"}
              description={
                emptyDescription ??
                "Try adjusting your filters, or search for something else."
              }
              actionLabel="Browse all products"
              actionHref="/search"
            />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {result.items.map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} />
              ))}
            </div>
          )}

          <Pagination page={page} totalPages={totalPages} basePath={basePath} searchParams={query as Record<string, string>} />
        </div>
      </div>
    </div>
  );
}

/** Build the filter sidebar context (brands/colors/sizes/price bounds). */
export async function buildFilterContext(categoryId?: string): Promise<FilterContext> {
  const { prisma } = await import("@/lib/db");
  const { getBrands, getCategoryIdsRecursive } = await import("@/lib/queries");

  // Hoisted out of the Promise.all array: an `await` inside the array
  // literal runs BEFORE Promise.all starts, serialising the two queries.
  const categoryIds = categoryId ? await getCategoryIdsRecursive(categoryId) : null;

  const [brands, products] = await Promise.all([
    getBrands(),
    prisma.product.findMany({
      where: {
        status: "ACTIVE",
        ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
      },
      select: { colors: true, sizes: true, price: true },
      take: 1000,
    }),
  ]);

  const colors = new Set<string>();
  const sizes = new Set<string>();
  let min = Infinity;
  let max = 0;

  for (const p of products) {
    try {
      (JSON.parse(p.colors ?? "[]") as string[]).forEach((c) => colors.add(c));
    } catch { /* ignore */ }
    try {
      (JSON.parse(p.sizes ?? "[]") as string[]).forEach((s) => sizes.add(s));
    } catch { /* ignore */ }
    const price = Number(p.price);
    if (price < min) min = price;
    if (price > max) max = price;
  }

  return {
    brands: brands.map((b) => ({ name: b.name, slug: b.slug })),
    colors: [...colors].slice(0, 24),
    sizes: [...sizes].slice(0, 24),
    priceBounds: {
      min: Number.isFinite(min) ? Math.floor(min) : 0,
      max: Math.ceil(max),
    },
  };
}
