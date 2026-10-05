import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import {
  getProductBySlug,
  getRelatedProducts,
  getFrequentlyBought,
} from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { absoluteUrl, truncate, formatBDT } from "@/lib/utils";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ProductRail } from "@/components/ui/ProductRail";
import { ProductCard } from "@/components/ui/ProductCard";
import { ProductPurchase } from "@/components/product/ProductPurchase";
import { ProductTabs } from "@/components/product/ProductTabs";
import { ReviewsSection } from "@/components/product/ReviewsSection";
import { RecentlyViewed } from "@/components/home/RecentlyViewed";
import { prisma } from "@/lib/db";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Product not found" };

  const settings = await getSettings();
  const desc =
    product.seoDescription ??
    truncate(
      `${product.name}${product.brand ? ` by ${product.brand.name}` : ""} — ${formatBDT(product.price)} at Imalissa. ${product.shortDescription ?? settings.seo.defaultDescription}`
    );

  const image = product.images[0]?.url ?? settings.seo.ogImage;

  return {
    title: product.seoTitle ?? product.name,
    description: desc,
    keywords: [product.name, product.brand?.name, product.category.name, "Imalissa"].filter(
      (k): k is string => Boolean(k)
    ),
    openGraph: {
      title: product.seoTitle ?? product.name,
      description: desc,
      type: "website",
      images: image ? [{ url: absoluteUrl(image), width: 1200, height: 630 }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: product.seoTitle ?? product.name,
      description: desc,
    },
    alternates: { canonical: `/product/${slug}` },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product || product.status !== "ACTIVE") notFound();

  const [related, bought, reviewCount] = await Promise.all([
    getRelatedProducts(product.id, product.categoryId, 8),
    getFrequentlyBought(product.id, 4),
    prisma.review.count({ where: { productId: product.id, status: "APPROVED" } }),
  ]);

  const settings = await getSettings();
  const image = product.images[0]?.url ?? settings.seo.ogImage;

  const specs = (product.specifications ?? []) as { 0?: string; 1?: string }[] | { key?: string; value?: string }[];
  const specRows: [string, string][] = Array.isArray(specs)
    ? specs
        .map((s) => {
          if (Array.isArray(s)) return [String(s[0]), String(s[1])] as [string, string];
          const o = s as Record<string, unknown>;
          if ("key" in o || "name" in o || "label" in o) {
            return [
              String(o.key ?? o.name ?? o.label ?? ""),
              String(o.value ?? o.value ?? ""),
            ] as [string, string];
          }
          return null;
        })
        .filter((x): x is [string, string] => Boolean(x && x[0]))
    : [];

  const tabs = [
    {
      key: "description",
      label: "Description",
      content: (
        <div className="space-y-3">
          {(product.description ?? "").split("\n").map((p, i) =>
            p.trim() ? <p key={i}>{p}</p> : null
          )}
          {product.shortDescription && !product.description && <p>{product.shortDescription}</p>}
        </div>
      ),
    },
    {
      key: "specifications",
      label: "Specifications",
      content:
        specRows.length > 0 ? (
          <table className="w-full">
            <tbody>
              {specRows.map(([k, v], i) => (
                <tr key={i} className={i % 2 ? "bg-white/[0.02]" : ""}>
                  <td className="w-1/3 border-b border-white/[0.06] px-4 py-3 text-mist-400">{k}</td>
                  <td className="border-b border-white/[0.06] px-4 py-3 text-mist-100">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-mist-500">No specifications listed for this product.</p>
        ),
    },
    {
      key: "shipping",
      label: "Shipping",
      content: (
        <div className="space-y-3">
          <p>
            {product.shippingInfo ??
              "Delivery within 2–5 working days across Bangladesh. Free delivery on orders over ৳3,000. Cash on Delivery available nationwide."}
          </p>
          <ul className="list-inside list-disc space-y-1.5 text-mist-400">
            <li>Dhaka: 1–2 working days</li>
            <li>Outside Dhaka: 3–5 working days</li>
            <li>Order tracking available with your order number</li>
          </ul>
        </div>
      ),
    },
    {
      key: "returns",
      label: "Returns",
      content: (
        <div className="space-y-3">
          <p>
            {product.returnInfo ??
              "7-day easy return policy. Products must be unused and in original packaging with all tags attached."}
          </p>
          <ul className="list-inside list-disc space-y-1.5 text-mist-400">
            <li>Report any issue within 7 days of delivery</li>
            <li>Quality issues are eligible for free replacement</li>
            <li>Contact support with your order number to start a return</li>
          </ul>
        </div>
      ),
    },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku,
    brand: product.brand ? { "@type": "Brand", name: product.brand.name } : undefined,
    description: truncate(product.description ?? product.shortDescription ?? product.name, 300),
    image: product.images.map((i) => absoluteUrl(i.url)),
    aggregateRating:
      reviewCount > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: product.rating,
            reviewCount: product.reviewCount,
          }
        : undefined,
    offers: {
      "@type": "Offer",
      priceCurrency: "BDT",
      price: product.discountPercent
        ? Number(product.price) * (1 - product.discountPercent / 100)
        : Number(product.price),
      availability: product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: absoluteUrl(`/product/${product.slug}`),
    },
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Breadcrumbs
        items={[
          ...(product.category.parent
            ? [{ label: product.category.parent.name, href: `/c/${product.category.parent.slug}` }]
            : []),
          { label: product.category.name, href: `/c/${product.category.slug}` },
          { label: product.name },
        ]}
      />

      <div className="mt-5">
        <ProductPurchase product={product} />
      </div>

      {/* Tabs */}
      <div className="mt-14 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 sm:px-6">
        <ProductTabs tabs={tabs} />
      </div>

      {/* Reviews */}
      <div className="mt-14">
        <ReviewsSection productId={product.id} />
      </div>

      {/* Frequently bought together-ish */}
      {bought.length > 0 && (
        <section className="mt-16">
          <SectionHeading title="Frequently Bought Together" subtitle="Customers who bought this also purchased" />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {bought.map((p, i) => (
              <ProductCard key={p.id} product={p} index={i} compact />
            ))}
          </div>
        </section>
      )}

      {/* Related */}
      {related.length > 0 && (
        <section className="mt-16">
          <SectionHeading
            title="Related Products"
            subtitle={`More from ${product.category.name}`}
            href={`/c/${product.category.slug}`}
          />
          <ProductRail products={related} />
        </section>
      )}

      {/* Recently viewed */}
      <section className="mt-16">
        <RecentlyViewed />
      </section>
    </div>
  );
}

export const revalidate = 300;
