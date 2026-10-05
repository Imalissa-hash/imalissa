import { cache } from "react";
import { prisma } from "./db";
import { salePrice, roundMoney } from "./utils";
import type { Prisma } from "@prisma/client";

/**
 * Catalog queries + serializers.
 *
 * Prisma Decimal / Date objects are converted to plain numbers/strings
 * before crossing into client components (Next.js serialization).
 * Every list query paginates with `limit + 1` to detect `hasMore`
 * without expensive COUNT queries.
 */

export type ProductStatusFilter = "ACTIVE";

export interface ProductCardData {
  id: string;
  name: string;
  slug: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  discountPercent: number;
  salePrice: number;
  stock: number;
  image: string | null;
  brandName: string | null;
  categoryName: string;
  categorySlug: string;
  rating: number;
  reviewCount: number;
  soldCount: number;
  isFeatured: boolean;
  isBestseller: boolean;
  newArrival: boolean;
  isDeal: boolean;
  colors: string[];
  sizes: string[];
}

type ImageLike = { url: string; position: number };
type RawProduct = {
  id: string;
  name: string;
  slug: string;
  sku: string;
  price: unknown;
  compareAtPrice: unknown;
  discountPercent: number;
  stock: number;
  rating: number;
  reviewCount: number;
  soldCount: number;
  isFeatured: boolean;
  isBestseller: boolean;
  newArrival: boolean;
  isDeal: boolean;
  colors: string | null;
  sizes: string | null;
  brand?: { name: string } | null;
  category?: { name: string; slug: string };
  images?: ImageLike[];
};

export function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function toProductCard(p: RawProduct): ProductCardData {
  const price = Number(p.price);
  const compareAt = p.compareAtPrice != null ? Number(p.compareAtPrice) : null;
  const images = p.images ? [...p.images].sort((a, b) => a.position - b.position) : [];

  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    sku: p.sku,
    price,
    compareAtPrice: compareAt,
    discountPercent: p.discountPercent || (compareAt ? Math.round(((compareAt - price) / compareAt) * 100) : 0),
    salePrice: salePrice(price, p.discountPercent),
    stock: p.stock,
    image: images[0]?.url ?? null,
    brandName: p.brand?.name ?? null,
    categoryName: p.category?.name ?? "",
    categorySlug: p.category?.slug ?? "",
    rating: p.rating,
    reviewCount: p.reviewCount,
    soldCount: p.soldCount,
    isFeatured: p.isFeatured,
    isBestseller: p.isBestseller,
    newArrival: p.newArrival,
    isDeal: p.isDeal,
    colors: parseJsonArray(p.colors),
    sizes: parseJsonArray(p.sizes),
  };
}

const cardInclude = {
  images: { orderBy: { position: "asc" as const }, take: 1 },
  brand: { select: { name: true } },
  category: { select: { name: true, slug: true } },
} satisfies object;

const activeWhere = { status: "ACTIVE" as const };

async function cards(
  where: object,
  orderBy: object,
  limit: number
): Promise<{ items: ProductCardData[]; hasMore: boolean }> {
  const rows = await prisma.product.findMany({
    where: { ...activeWhere, ...where },
    orderBy,
    take: limit + 1,
    include: cardInclude,
  });
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(toProductCard);
  return { items, hasMore };
}

export const getFeatured = (limit = 8) =>
  cards({ isFeatured: true }, [{ soldCount: "desc" }, { rating: "desc" }], limit);

export const getNewArrivals = (limit = 8) =>
  cards({}, { createdAt: "desc" }, limit);

export const getBestsellers = (limit = 8) =>
  cards({ isBestseller: true }, { soldCount: "desc" }, limit);

export const getDeals = (limit = 8) =>
  cards({ OR: [{ isDeal: true }, { discountPercent: { gte: 15 } }] }, { discountPercent: "desc" }, limit);

export const getProductsByCategoryFlag = (categoryId: string, limit = 8) =>
  cards({ categoryId }, { soldCount: "desc" }, limit);

// ------------------------------------------------------------
// Categories
// ------------------------------------------------------------

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  icon: string | null;
  productCount?: number;
  children: CategoryNode[];
}

// Request-scoped dedupe: the layout, footer, home page and category tiles
// all ask for the same tree/settings/banners in one render — cache() runs
// the query once instead of 4+ times per page view.
export const getCategoryTree = cache(async (includeHidden = false): Promise<CategoryNode[]> => {
  const rows = await prisma.category.findMany({
    where: includeHidden ? {} : { isActive: true },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      image: true,
      icon: true,
      parentId: true,
      showInMenu: true,
      isActive: true,
    },
  });

  const nodes = new Map<string, CategoryNode & { showInMenu?: boolean }>();
  for (const r of rows) {
    nodes.set(r.id, {
      id: r.id,
      name: r.name,
      slug: r.slug,
      image: r.image,
      icon: r.icon,
      children: [],
    });
  }

  const roots: (CategoryNode & { showInMenu?: boolean })[] = [];
  for (const r of rows) {
    const node = nodes.get(r.id)!;
    (node as { showInMenu?: boolean }).showInMenu = r.showInMenu;
    if (r.parentId && nodes.has(r.parentId)) {
      nodes.get(r.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
});

/** Categories for the main nav (top-level + children, menu-visible only). */
export async function getNavCategories(): Promise<CategoryNode[]> {
  const tree = await getCategoryTree(false);
  return tree.filter((c) => true).map((c) => ({
    ...c,
    children: c.children.filter((ch) => ch.children.length >= 0),
  }));
}

export interface CategoryWithCounts extends CategoryNode {
  parentId: string | null;
  parent: { name: string; slug: string } | null;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
}

export async function getCategoryBySlug(slug: string): Promise<CategoryWithCounts | null> {
  const c = await prisma.category.findUnique({
    where: { slug },
    include: { parent: { select: { name: true, slug: true } } },
  });
  if (!c) return null;

  const children = await prisma.category.findMany({
    where: { parentId: c.id, isActive: true },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true, image: true, icon: true },
  });

  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    image: c.image,
    icon: c.icon,
    parentId: c.parentId,
    parent: c.parent ?? null,
    description: c.description,
    seoTitle: c.seoTitle,
    seoDescription: c.seoDescription,
    children: children.map((ch) => ({ ...ch, children: [] })),
  };
}

export const getCategoryIdsRecursive = cache(async (rootId: string): Promise<string[]> => {
  const all = await prisma.category.findMany({
    select: { id: true, parentId: true },
  });
  const byParent = new Map<string | null, string[]>();
  for (const c of all) {
    const list = byParent.get(c.parentId) ?? [];
    list.push(c.id);
    byParent.set(c.parentId, list);
  }
  const out: string[] = [rootId];
  const queue = [rootId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const child of byParent.get(cur) ?? []) {
      out.push(child);
      queue.push(child);
    }
  }
  return out;
});

// ------------------------------------------------------------
// Product detail
// ------------------------------------------------------------

export async function getProductBySlug(slug: string) {
  const product = await prisma.product.findUnique({
    where: { slug },
    include: {
      images: { orderBy: { position: "asc" } },
      variants: { orderBy: [{ color: "asc" }, { size: "asc" }] },
      brand: true,
      category: {
        include: { parent: { select: { name: true, slug: true } } },
      },
    },
  });
  if (!product) return null;

  const { specifications, ...rest } = product;
  return {
    ...rest,
    price: Number(rest.price),
    compareAtPrice: rest.compareAtPrice != null ? Number(rest.compareAtPrice) : null,
    costPrice: null as number | null,
    specifications: ( specifications as Record<string, string>[] | null) ?? null,
    colors: parseJsonArray(rest.colors),
    sizes: parseJsonArray(rest.sizes),
  };
}

export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProductBySlug>>>;

export async function getRelatedProducts(
  productId: string,
  categoryId: string,
  limit = 8
): Promise<ProductCardData[]> {
  const sameCategory = await prisma.product.findMany({
    where: { ...activeWhere, categoryId, id: { not: productId } },
    orderBy: { soldCount: "desc" },
    take: limit,
    include: cardInclude,
  });
  if (sameCategory.length >= limit) return sameCategory.map(toProductCard);

  const filler = await prisma.product.findMany({
    where: {
      ...activeWhere,
      id: { notIn: [productId, ...sameCategory.map((p) => p.id)] },
      isFeatured: true,
    },
    orderBy: { rating: "desc" },
    take: limit - sameCategory.length,
    include: cardInclude,
  });

  return [...sameCategory, ...filler].map(toProductCard);
}

// ------------------------------------------------------------
// Search + filters
// ------------------------------------------------------------

export type SortKey = "relevance" | "price_asc" | "price_desc" | "newest" | "rating" | "discount";

export interface ProductFilters {
  q?: string;
  categorySlug?: string;
  brandSlugs?: string[];
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  inStock?: boolean;
  minDiscount?: number;
  color?: string;
  size?: string;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
}

export interface SearchResult {
  items: ProductCardData[];
  hasMore: boolean;
  page: number;
  total: number;
}

export async function searchProducts(filters: ProductFilters): Promise<SearchResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(Math.max(filters.pageSize ?? 12, 1), 48);

  const where: Record<string, unknown> = { ...activeWhere };

  if (filters.q) {
    const q = filters.q.trim();
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { shortDescription: { contains: q } },
        { sku: { contains: q } },
        { brand: { name: { contains: q } } },
        { category: { name: { contains: q } } },
      ];
    }
  }

  if (filters.categorySlug) {
    const cat = await prisma.category.findUnique({ where: { slug: filters.categorySlug } });
    if (cat) {
      const ids = await getCategoryIdsRecursive(cat.id);
      where.categoryId = { in: ids };
    }
  }

  if (filters.brandSlugs?.length) {
    const brands = await prisma.brand.findMany({
      where: { slug: { in: filters.brandSlugs } },
      select: { id: true },
    });
    where.brandId = { in: brands.map((b) => b.id) };
  }

  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    where.price = {
      ...(filters.minPrice !== undefined ? { gte: filters.minPrice } : {}),
      ...(filters.maxPrice !== undefined ? { lte: filters.maxPrice } : {}),
    };
  }

  if (filters.minRating) where.rating = { gte: filters.minRating };
  if (filters.inStock) where.stock = { gt: 0 };
  if (filters.minDiscount) where.discountPercent = { gte: filters.minDiscount };

  if (filters.color) where.colors = { contains: `"${filters.color}"` };
  if (filters.size) where.sizes = { contains: `"${filters.size}"` };

  const orderBy:
    | Prisma.ProductOrderByWithRelationInput
    | Prisma.ProductOrderByWithRelationInput[] =
    filters.sort === "price_asc"
      ? { price: "asc" }
      : filters.sort === "price_desc"
        ? { price: "desc" }
        : filters.sort === "newest"
          ? { createdAt: "desc" }
          : filters.sort === "rating"
            ? { rating: "desc" }
            : filters.sort === "discount"
              ? { discountPercent: "desc" }
              : [{ soldCount: "desc" }, { rating: "desc" }];

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize + 1,
      include: cardInclude,
    }),
    prisma.product.count({ where }),
  ]);

  const hasMore = rows.length > pageSize;
  return {
    items: rows.slice(0, pageSize).map(toProductCard),
    hasMore,
    page,
    total,
  };
}

export interface Suggestion {
  type: "product" | "category" | "brand";
  label: string;
  sublabel?: string;
  href: string;
  image?: string | null;
}

export async function getSuggestions(q: string): Promise<Suggestion[]> {
  const term = q.trim();
  if (term.length < 2) return [];

  const [products, categories, brands] = await Promise.all([
    prisma.product.findMany({
      where: { ...activeWhere, name: { contains: term } },
      orderBy: { soldCount: "desc" },
      take: 6,
      include: { images: { orderBy: { position: "asc" }, take: 1 } },
    }),
    prisma.category.findMany({
      where: { isActive: true, name: { contains: term } },
      take: 3,
    }),
    prisma.brand.findMany({
      where: { isActive: true, name: { contains: term } },
      take: 3,
    }),
  ]);

  const out: Suggestion[] = [];
  for (const c of categories) {
    out.push({ type: "category", label: c.name, sublabel: "Category", href: `/c/${c.slug}` });
  }
  for (const b of brands) {
    out.push({ type: "brand", label: b.name, sublabel: "Brand", href: `/brand/${b.slug}` });
  }
  for (const p of products) {
    out.push({
      type: "product",
      label: p.name,
      sublabel: `৳${Number(p.price).toLocaleString("en-US")}`,
      href: `/product/${p.slug}`,
      image: p.images[0]?.url ?? null,
    });
  }
  return out;
}

// ------------------------------------------------------------
// Home page data
// ------------------------------------------------------------

export const getBanners = cache(
  async (position?: "HERO" | "PROMO" | "STRIP" | "FOOTER") => {
    const banners = await prisma.banner.findMany({
      where: { isActive: true, ...(position ? { position } : {}) },
      orderBy: [{ position: "asc" }, { positionIndex: "asc" }],
    });
    return banners;
  }
);

export interface HomeSectionData {
  id: string;
  key: string;
  title: string;
  subtitle: string | null;
  type: string;
  source: string;
  itemIds: string[] | null;
  image: string | null;
  link: string | null;
  buttonText: string | null;
  order: number;
}

export const getHomeSections = cache(async (): Promise<HomeSectionData[]> => {
  const rows = await prisma.homeSection.findMany({
    where: { isVisible: true },
    orderBy: { order: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    title: r.title,
    subtitle: r.subtitle,
    type: r.type,
    source: r.source,
    itemIds: Array.isArray(r.itemIds) ? (r.itemIds as string[]) : null,
    image: r.image,
    link: r.link,
    buttonText: r.buttonText,
    order: r.order,
  }));
});

/** Resolve the products for a home section by its source key. */
/** Section source → real category slugs (seed sources ≠ category slugs). */
const SECTION_CATEGORY_ALIASES: Record<string, string[]> = {
  kids_baby: ["boys", "girls", "baby"],
  kids: ["boys", "girls", "baby"],
  home: ["home-lifestyle"],
  lifestyle: ["home-lifestyle"],
};

export async function getSectionProducts(source: string, itemIds: string[] | null, limit = 8) {
  if (itemIds?.length) {
    const rows = await prisma.product.findMany({
      where: { ...activeWhere, id: { in: itemIds } },
      include: cardInclude,
    });
    const ordered = itemIds
      .map((id) => rows.find((r) => r.id === id))
      .filter(Boolean) as typeof rows;
    return ordered.slice(0, limit).map(toProductCard);
  }

  switch (source) {
    case "featured":
      return (await getFeatured(limit)).items;
    case "bestsellers":
      return (await getBestsellers(limit)).items;
    case "new_arrivals":
      return (await getNewArrivals(limit)).items;
    case "deals":
      return (await getDeals(limit)).items;
    case "trending":
      // No "trending" category exists — rank by units sold instead of
      // silently duplicating the featured rail.
      return (await cards({}, { soldCount: "desc" }, limit)).items;
    default: {
      // Admin section sources don't always equal category slugs
      // (e.g. "kids_baby" → boys/girls/baby, "home" → home-lifestyle).
      const slugs = SECTION_CATEGORY_ALIASES[source] ?? [source];
      const cats = await prisma.category.findMany({
        where: { slug: { in: slugs }, isActive: true },
        select: { id: true },
      });
      if (cats.length) {
        const idLists = await Promise.all(cats.map((c) => getCategoryIdsRecursive(c.id)));
        const ids = [...new Set(idLists.flat())];
        const rows = await prisma.product.findMany({
          where: { ...activeWhere, categoryId: { in: ids } },
          orderBy: { soldCount: "desc" },
          take: limit,
          include: cardInclude,
        });
        if (rows.length) return rows.map(toProductCard);
      }
      return (await getFeatured(limit)).items;
    }
  }
}

export async function getBrands() {
  return prisma.brand.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
}

export async function getBrandBySlug(slug: string) {
  return prisma.brand.findUnique({ where: { slug } });
}

/** Products viewed together — simple "frequently bought" stand-in. */
export async function getFrequentlyBought(productId: string, limit = 4): Promise<ProductCardData[]> {
  // Products that share an order with this product (co-purchase).
  const orderIds = await prisma.orderItem.findMany({
    where: { productId, order: { status: { notIn: ["CANCELLED", "FAILED"] } } },
    select: { orderId: true },
    distinct: ["orderId"],
    take: 50,
  });

  if (orderIds.length > 0) {
    const rows = await prisma.orderItem.findMany({
      where: {
        orderId: { in: orderIds.map((o) => o.orderId) },
        productId: { not: productId },
      },
      include: { product: { include: cardInclude } },
      take: limit * 3,
    });
    const seen = new Set<string>();
    const out: ProductCardData[] = [];
    for (const row of rows) {
      if (!row.product || row.product.status !== "ACTIVE") continue;
      if (seen.has(row.product.id)) continue;
      seen.add(row.product.id);
      out.push(toProductCard(row.product));
      if (out.length >= limit) break;
    }
    if (out.length) return out;
  }

  const fallback = await prisma.product.findMany({
    where: { ...activeWhere, id: { not: productId } },
    orderBy: { soldCount: "desc" },
    take: limit,
    include: cardInclude,
  });
  return fallback.map(toProductCard);
}

export { roundMoney };
