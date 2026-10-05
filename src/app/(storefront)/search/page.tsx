import type { Metadata } from "next";
import { ProductListing, buildFilterContext } from "@/components/shop/ProductListing";
import { absoluteUrl } from "@/lib/utils";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const metadata: Metadata = {
  title: "Search Products",
  description:
    "Search thousands of products at Imalissa — electronics, fashion, kids, home & more. Filter by brand, price, rating and more.",
  robots: { index: false, follow: true },
};

export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";

  const filterContext = await buildFilterContext();

  const query = {
    q: q || undefined,
    brand: typeof sp.brand === "string" ? sp.brand : undefined,
    color: typeof sp.color === "string" ? sp.color : undefined,
    size: typeof sp.size === "string" ? sp.size : undefined,
    min: typeof sp.min === "string" ? sp.min : undefined,
    max: typeof sp.max === "string" ? sp.max : undefined,
    rating: typeof sp.rating === "string" ? sp.rating : undefined,
    stock: typeof sp.stock === "string" ? sp.stock : undefined,
    discount: typeof sp.discount === "string" ? sp.discount : undefined,
    sort: typeof sp.sort === "string" ? sp.sort : undefined,
    page: typeof sp.page === "string" ? sp.page : undefined,
  };

  return (
    <ProductListing
      query={query}
      basePath="/search"
      crumbs={[{ label: "Search" }]}
      heading={q ? `Results for “${q}”` : "All Products"}
      headingNote={q ? undefined : "Browse our complete catalog with filters"}
      filterContext={filterContext}
      emptyTitle={q ? `Nothing found for “${q}”` : "No products found"}
      emptyDescription={
        q
          ? "Check the spelling, try a more general term, or browse our categories."
          : "Try adjusting the filters."
      }
    />
  );
}

export const dynamic = "force-dynamic";
