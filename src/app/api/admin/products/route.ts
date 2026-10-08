import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma, ProductStatus } from "@prisma/client";
import { withApi, jsonOk, parseBody, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { badRequest, conflict } from "@/lib/errors";
import { appendSuffix, salePrice, slugify } from "@/lib/utils";
import type { ProductFacets, ProductRow } from "@/components/admin/catalog/ProductsClient";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
const SORTS = ["newest", "price_asc", "price_desc", "name", "stock"] as const;

// ── Zod helpers ─────────────────────────────────────────────
// "" / null → null (clear), undefined → undefined (no change), NaN → rejected.
const toNullIfBlank = (v: unknown) => (v === "" || v === null ? null : v);

const numOrNull = (min: number) =>
  z.preprocess(
    (v) => (v === undefined ? undefined : v === "" || v === null ? null : Number(v)),
    z.number().min(min).nullable().optional()
  );

const numRequired = (min: number) =>
  z.preprocess(
    (v) => (v === undefined || v === "" || v === null ? NaN : Number(v)),
    z.number().min(min)
  );

/** Non-nullable Prisma Int columns: null / "" is invalid input (400), absent = no change. */
const intOpt = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === undefined ? undefined : v === "" || v === null ? NaN : Number(v)),
    z.number().int().min(min).max(max).optional()
  );

const intRequired = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === undefined || v === "" || v === null ? NaN : Number(v)),
    z.number().int().min(min).max(max)
  );

const textOrNull = (max: number) =>
  z.preprocess(
    (v) => (v === undefined ? undefined : v === null || (typeof v === "string" && !v.trim()) ? null : v),
    z.string().trim().max(max, `Too long (max ${max} characters)`).nullable().optional()
  );

const csvOrArray = z.union([z.array(z.string().max(64)), z.string().max(4000)]).optional();

const imageInput = z.object({
  url: z.string().min(1, "Image URL is required").max(500),
  alt: z.preprocess(toNullIfBlank, z.string().max(300).nullable().optional()),
});

const variantInput = z.object({
  id: z.string().min(1).optional(),
  sku: z.string().trim().min(1, "Variant SKU is required").max(64),
  color: z.preprocess(toNullIfBlank, z.string().max(64).nullable().optional()),
  size: z.preprocess(toNullIfBlank, z.string().max(32).nullable().optional()),
  price: numOrNull(0),
  stock: intRequired(0, 1_000_000),
});

const productBody = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(200),
  slug: z.preprocess(toNullIfBlank, z.string().trim().min(2).max(160).nullable().optional()),
  sku: z.string().trim().min(1, "SKU is required").max(64),
  brandId: z.preprocess(toNullIfBlank, z.string().trim().min(1).nullable().optional()),
  categoryId: z.string().trim().min(1, "Choose a category"),
  price: numRequired(0.01),
  compareAtPrice: numOrNull(0),
  discountPercent: intOpt(0, 100),
  stock: intOpt(0, 1_000_000),
  lowStockThreshold: intOpt(0, 1_000_000),
  status: z.enum(STATUSES).optional(),
  isFeatured: z.boolean().optional(),
  isBestseller: z.boolean().optional(),
  newArrival: z.boolean().optional(),
  isDeal: z.boolean().optional(),
  shortDescription: textOrNull(500),
  description: textOrNull(8000),
  colors: csvOrArray,
  sizes: csvOrArray,
  seoTitle: textOrNull(200),
  seoDescription: textOrNull(400),
  images: z.array(imageInput).max(20).optional(),
  variants: z.array(variantInput).max(100).optional(),
});

const createSchema = productBody;
const patchSchema = productBody.partial();

// ── Serialization (Prisma Decimal → plain numbers) ─────────
const listInclude = {
  images: { orderBy: { position: "asc" as const }, take: 1 },
  category: { select: { name: true } },
  brand: { select: { name: true } },
} satisfies object;

interface ListProduct {
  id: string;
  name: string;
  slug: string;
  sku: string;
  price: unknown;
  compareAtPrice: unknown;
  discountPercent: number;
  stock: number;
  lowStockThreshold: number;
  status: string;
  isFeatured: boolean;
  isBestseller: boolean;
  newArrival: boolean;
  isDeal: boolean;
  images: { url: string }[];
  category: { name: string };
  brand: { name: string } | null;
}

function toRow(p: ListProduct): ProductRow {
  const price = Number(p.price);
  const compareAt = p.compareAtPrice != null ? Number(p.compareAtPrice) : null;
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    sku: p.sku,
    price,
    compareAtPrice: compareAt,
    discountPercent: p.discountPercent,
    salePrice: salePrice(price, p.discountPercent),
    stock: p.stock,
    lowStockThreshold: p.lowStockThreshold,
    status: p.status,
    isFeatured: p.isFeatured,
    isBestseller: p.isBestseller,
    newArrival: p.newArrival,
    isDeal: p.isDeal,
    image: p.images[0]?.url ?? null,
    categoryName: p.category.name,
    brandName: p.brand?.name ?? null,
  };
}

/** "low" = above zero but at/below the configured threshold (column compare → JS). */
const isLow = (p: { stock: number; lowStockThreshold: number }) =>
  p.stock > 0 && p.stock <= p.lowStockThreshold;
const isOut = (p: { stock: number }) => p.stock <= 0;

function toJsonColumn(value: string[] | string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const arr = (Array.isArray(value) ? value : value.split(","))
    .map((s) => s.trim())
    .filter(Boolean);
  return arr.length ? JSON.stringify(arr) : null;
}

async function uniqueProductSlug(base: string): Promise<string> {
  let slug = base;
  for (let i = 2; i <= 50; i++) {
    const hit = await prisma.product.findUnique({ where: { slug }, select: { id: true } });
    if (!hit) return slug;
    slug = appendSuffix(base, i);
  }
  throw conflict("Could not allocate a unique slug — please pick one manually");
}

function checkVariantRows(rows: { sku: string; color?: string | null; size?: string | null }[]): void {
  const skus = new Set<string>();
  const combos = new Set<string>();
  for (const r of rows) {
    const key = r.sku.trim().toLowerCase();
    if (skus.has(key)) throw badRequest(`Duplicate variant SKU "${r.sku}"`);
    skus.add(key);
    if (r.color && r.size) {
      const combo = `${r.color.toLowerCase()}::${r.size.toLowerCase()}`;
      if (combos.has(combo)) throw badRequest(`Duplicate variant ${r.color} / ${r.size}`);
      combos.add(combo);
    }
  }
}

async function assertVariantSkusFree(
  rows: { id?: string; sku: string }[]
): Promise<void> {
  for (const r of rows) {
    const hit = await prisma.productVariant.findUnique({
      where: { sku: r.sku.trim() },
      select: { id: true },
    });
    if (hit && hit.id !== r.id) throw conflict(`Variant SKU "${r.sku}" is already in use`);
  }
}

// ── GET /api/admin/products ────────────────────────────────
export const GET = withApi(async (req: NextRequest) => {
  await requirePermission("products.view");

  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").trim();
  const status = sp.get("status") ?? "";
  const categoryId = sp.get("categoryId") ?? "";
  const brandId = sp.get("brandId") ?? "";
  const stock = sp.get("stock") ?? "";
  const sort = sp.get("sort") ?? "newest";
  const requestedPage = Math.max(1, Number(sp.get("page")) || 1);

  if (status && !STATUSES.includes(status as (typeof STATUSES)[number])) {
    throw badRequest("Invalid status filter");
  }
  if (stock && stock !== "low" && stock !== "out") throw badRequest("Invalid stock filter");
  if (!SORTS.includes(sort as (typeof SORTS)[number])) throw badRequest("Invalid sort key");

  const baseWhere: Prisma.ProductWhereInput = {};
  if (q) baseWhere.OR = [{ name: { contains: q } }, { sku: { contains: q } }];
  if (status) baseWhere.status = status as ProductStatus;
  const facetWhere: Prisma.ProductWhereInput = { ...baseWhere };
  if (categoryId) baseWhere.categoryId = categoryId;
  if (brandId) baseWhere.brandId = brandId;

  const orderBy: Prisma.ProductOrderByWithRelationInput =
    sort === "price_asc"
      ? { price: "asc" }
      : sort === "price_desc"
        ? { price: "desc" }
        : sort === "name"
          ? { name: "asc" }
          : sort === "stock"
            ? { stock: "asc" }
            : { createdAt: "desc" };

  const [rows, catCounts, categories, brands] = await Promise.all([
    prisma.product.findMany({ where: baseWhere, orderBy, include: listInclude }),
    prisma.product.groupBy({ by: ["categoryId"], where: facetWhere, _count: { _all: true } }),
    prisma.category.findMany({
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const filtered =
    stock === "low" ? rows.filter(isLow) : stock === "out" ? rows.filter(isOut) : rows;
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const items = filtered
    .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    .map(toRow);

  const countByCategory = new Map(catCounts.map((g) => [g.categoryId, g._count._all]));
  const facets: ProductFacets = {
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      count: countByCategory.get(c.id) ?? 0,
    })),
    brands,
  };

  return jsonOk({ items, total, totalPages, page, facets });
});

// ── POST /api/admin/products — create ──────────────────────
export const POST = withApi(async (req: NextRequest) => {
  const admin = await requirePermission("products.manage");
  const body = parseBody(createSchema, await req.json().catch(() => ({})));

  const skuTaken = await prisma.product.findUnique({ where: { sku: body.sku }, select: { id: true } });
  if (skuTaken) throw conflict(`SKU "${body.sku}" is already used by another product`);

  const category = await prisma.category.findUnique({ where: { id: body.categoryId }, select: { id: true } });
  if (!category) throw badRequest("categoryId: Choose a valid category");
  if (body.brandId) {
    const brand = await prisma.brand.findUnique({ where: { id: body.brandId }, select: { id: true } });
    if (!brand) throw badRequest("brandId: Choose a valid brand");
  }

  const variantRows = body.variants ?? [];
  checkVariantRows(variantRows);
  await assertVariantSkusFree(variantRows);

  const slug = await uniqueProductSlug(body.slug ? slugify(body.slug) : slugify(body.name));
  if (!slug) throw badRequest("slug: Could not generate a slug from the name");

  const images = body.images ?? [];
  if (images.some((i) => !i.url.startsWith("/uploads/") && !/^https?:\/\//.test(i.url))) {
    throw badRequest("images: Image URLs must be an uploaded /uploads/… path or an absolute http(s) URL");
  }

  const product = await prisma.product.create({
    data: {
      name: body.name,
      slug,
      sku: body.sku,
      brandId: body.brandId ?? null,
      categoryId: body.categoryId,
      price: body.price,
      compareAtPrice: body.compareAtPrice ?? null,
      discountPercent: body.discountPercent ?? 0,
      stock: body.stock ?? 0,
      lowStockThreshold: body.lowStockThreshold ?? 5,
      status: body.status ?? "ACTIVE",
      isFeatured: body.isFeatured ?? false,
      isBestseller: body.isBestseller ?? false,
      newArrival: body.newArrival ?? false,
      isDeal: body.isDeal ?? false,
      shortDescription: body.shortDescription ?? null,
      description: body.description ?? null,
      colors: toJsonColumn(body.colors) ?? null,
      sizes: toJsonColumn(body.sizes) ?? null,
      seoTitle: body.seoTitle ?? null,
      seoDescription: body.seoDescription ?? null,
      images: {
        create: images.map((img, i) => ({ url: img.url, alt: img.alt ?? null, position: i })),
      },
      variants: {
        create: variantRows.map((v, i) => ({
          sku: v.sku.trim(),
          color: v.color ?? null,
          size: v.size ?? null,
          price: v.price ?? null,
          stock: v.stock,
          position: i,
        })),
      },
    },
    select: { id: true, slug: true },
  });

  await audit({
    adminId: admin.id,
    action: "PRODUCT_CREATE",
    entityType: "Product",
    entityId: product.id,
    details: { name: body.name, sku: body.sku, slug: product.slug },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({ id: product.id, slug: product.slug });
});
