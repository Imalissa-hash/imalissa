import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { absoluteUrl } from "@/lib/utils";
import { POLICIES } from "@/lib/policies";

/**
 * Sitemap: static pages + categories + products.
 * Products/categories are read live; the list is capped so the sitemap
 * stays fast even with a huge catalog.
 */
const MAX_PRODUCTS = 4000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/search"), lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl("/about"), lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: absoluteUrl("/contact"), lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    {
      url: absoluteUrl("/track-order"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
  ];

  const policyPages: MetadataRoute.Sitemap = POLICIES.map((p) => ({
    url: absoluteUrl(`/p/${p.slug}`),
    lastModified: now,
    changeFrequency: "yearly" as const,
    priority: 0.3,
  }));

  let categoryPages: MetadataRoute.Sitemap = [];
  let productPages: MetadataRoute.Sitemap = [];
  try {
    const [categories, products] = await Promise.all([
      prisma.category.findMany({
        where: { isActive: true },
        select: { slug: true, updatedAt: true },
        orderBy: { position: "asc" },
      }),
      prisma.product.findMany({
        where: { status: "ACTIVE" },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: MAX_PRODUCTS,
      }),
    ]);

    categoryPages = categories.map((c) => ({
      url: absoluteUrl(`/c/${c.slug}`),
      lastModified: c.updatedAt,
      changeFrequency: "daily",
      priority: 0.8,
    }));

    productPages = products.map((p) => ({
      url: absoluteUrl(`/product/${p.slug}`),
      lastModified: p.updatedAt,
      changeFrequency: "weekly",
      priority: 0.7,
    }));
  } catch (err) {
    // Sitemap must never 500 — degrade to static pages only.
    console.error("[sitemap] catalog query failed:", err);
  }

  return [...staticPages, ...policyPages, ...categoryPages, ...productPages];
}
