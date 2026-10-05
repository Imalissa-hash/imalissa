import type { Metadata } from "next";
import { ProductListing, buildFilterContext } from "@/components/shop/ProductListing";
import { getCategoryBySlug } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { truncate, absoluteUrl } from "@/lib/utils";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: "Category not found" };

  const settings = await getSettings();
  const title = category.seoTitle ?? `${category.name} — Shop Online at Imalissa`;
  const description =
    category.seoDescription ??
    truncate(
      category.description ??
        `Buy ${category.name} online in Bangladesh at Imalissa. Authentic products, cash on delivery, fast shipping. ${settings.seo.defaultDescription}`
    );

  return {
    title,
    description,
    openGraph: { title, description, url: absoluteUrl(`/c/${slug}`), type: "website" },
    alternates: { canonical: `/c/${slug}` },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const category = await getCategoryBySlug(slug);
  if (!category || !category.parentId === false) {
    if (!category) notFound();
  }

  const filterContext = await buildFilterContext(category.id);

  const query = {
    categorySlug: slug,
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

  const crumbs = [
    ...(category.parent
      ? [{ label: category.parent.name, href: `/c/${category.parent.slug}` }]
      : []),
    { label: category.name },
  ];

  // Category description blurb
  const intro = category.description;

  return (
    <>
      {intro && (
        <div className="border-b border-white/[0.06] bg-gradient-to-r from-ink-900 via-ink-850 to-ink-900">
          <div className="mx-auto max-w-[1400px] px-4 py-7 sm:px-6 lg:px-8">
            <p className="max-w-3xl text-sm leading-relaxed text-mist-400">{intro}</p>
          </div>
        </div>
      )}
      <ProductListing
        query={query}
        basePath={`/c/${slug}`}
        crumbs={crumbs}
        heading={category.name}
        filterContext={filterContext}
        emptyTitle={`No products in ${category.name} yet`}
        emptyDescription="We're stocking this department soon — check our other categories meanwhile."
      />
    </>
  );
}

export const revalidate = 60;
