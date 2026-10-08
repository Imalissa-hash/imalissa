import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { withApi, jsonOk, parseBody, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { slugify } from "@/lib/utils";
import { parseJsonArray } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const idFrom = async (ctx?: Ctx): Promise<string> => (await ctx?.params)?.id ?? "";

// ── Zod helpers (same contract as /api/admin/products) ─────
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
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
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

const patchSchema = productBody.partial();

// ── Variant list validation (shared by PATCH paths) ────────
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

async function assertVariantSkusFree(rows: { id?: string; sku: string }[]): Promise<void> {
  for (const r of rows) {
    const hit = await prisma.productVariant.findUnique({
      where: { sku: r.sku.trim() },
      select: { id: true },
    });
    if (hit && hit.id !== r.id) throw conflict(`Variant SKU "${r.sku}" is already in use`);
  }
}

function toJsonColumn(value: string[] | string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const arr = (Array.isArray(value) ? value : value.split(","))
    .map((s) => s.trim())
    .filter(Boolean);
  return arr.length ? JSON.stringify(arr) : null;
}

function validImageUrl(url: string): boolean {
  return url.startsWith("/uploads/") || /^https?:\/\//.test(url);
}

// ── GET /api/admin/products/[id] — full detail ─────────────
const fullInclude = {
  images: { orderBy: { position: "asc" as const } },
  variants: { orderBy: { position: "asc" as const } },
  brand: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
} satisfies object;

export const GET = withApi<Ctx>(async (req: NextRequest, ctx?: Ctx) => {
  await requirePermission("products.view");
  const id = await idFrom(ctx);
  if (!id) throw notFound("Product not found");

  const product = await prisma.product.findUnique({ where: { id }, include: fullInclude });
  if (!product) throw notFound("Product not found");

  return jsonOk({
    id: product.id,
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    brandId: product.brandId,
    brandName: product.brand?.name ?? null,
    categoryId: product.categoryId,
    categoryName: product.category.name,
    price: Number(product.price),
    compareAtPrice: product.compareAtPrice != null ? Number(product.compareAtPrice) : null,
    costPrice: product.costPrice != null ? Number(product.costPrice) : null,
    discountPercent: product.discountPercent,
    stock: product.stock,
    lowStockThreshold: product.lowStockThreshold,
    status: product.status,
    isFeatured: product.isFeatured,
    isBestseller: product.isBestseller,
    newArrival: product.newArrival,
    isDeal: product.isDeal,
    rating: product.rating,
    ratingCount: product.ratingCount,
    reviewCount: product.reviewCount,
    soldCount: product.soldCount,
    viewCount: product.viewCount,
    colors: parseJsonArray(product.colors),
    sizes: parseJsonArray(product.sizes),
    shortDescription: product.shortDescription,
    description: product.description,
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    externalProductId: product.externalProductId,
    externalSku: product.externalSku,
    createdAt: new Date(product.createdAt).toISOString(),
    updatedAt: new Date(product.updatedAt).toISOString(),
    images: product.images.map((i) => ({ id: i.id, url: i.url, alt: i.alt, position: i.position })),
    variants: product.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      color: v.color,
      size: v.size,
      price: v.price != null ? Number(v.price) : null,
      stock: v.stock,
      position: v.position,
    })),
  });
});

// ── PATCH /api/admin/products/[id] — partial + image/variant sync ──
export const PATCH = withApi<Ctx>(async (req: NextRequest, ctx?: Ctx) => {
  const admin = await requirePermission("products.manage");
  const id = await idFrom(ctx);
  if (!id) throw notFound("Product not found");

  const existing = await prisma.product.findUnique({
    where: { id },
    include: { variants: { select: { id: true } } },
  });
  if (!existing) throw notFound("Product not found");

  const body = parseBody(patchSchema, await req.json().catch(() => ({})));

  if (body.sku !== undefined) {
    const dup = await prisma.product.findUnique({ where: { sku: body.sku }, select: { id: true } });
    if (dup && dup.id !== id) throw conflict(`SKU "${body.sku}" is already used by another product`);
  }
  if (body.categoryId !== undefined) {
    const cat = await prisma.category.findUnique({ where: { id: body.categoryId }, select: { id: true } });
    if (!cat) throw badRequest("categoryId: Choose a valid category");
  }
  if (body.brandId) {
    const brand = await prisma.brand.findUnique({ where: { id: body.brandId }, select: { id: true } });
    if (!brand) throw badRequest("brandId: Choose a valid brand");
  }

  let slug: string | undefined;
  if (body.slug !== undefined) {
    const desired = body.slug ? slugify(body.slug) : slugify(body.name ?? existing.name);
    if (!desired) throw badRequest("slug: Could not generate a slug from the name");
    if (desired !== existing.slug) {
      const dup = await prisma.product.findUnique({ where: { slug: desired }, select: { id: true } });
      if (dup && dup.id !== id) throw conflict(`Slug "${desired}" is already in use — pick another`);
    }
    slug = desired;
  }

  if (body.images !== undefined && body.images.some((i) => !validImageUrl(i.url))) {
    throw badRequest("images: Image URLs must be an uploaded /uploads/… path or an absolute http(s) URL");
  }

  // Variant sync pre-checks (before touching the DB).
  const incoming = body.variants;
  let removeIds: string[] = [];
  if (incoming !== undefined) {
    checkVariantRows(incoming);
    await assertVariantSkusFree(incoming);
    const existingIds = new Set(existing.variants.map((v) => v.id));
    for (const v of incoming) {
      if (v.id && !existingIds.has(v.id)) throw badRequest(`variants: Unknown variant "${v.id}"`);
    }
    const keep = new Set(incoming.map((v) => v.id).filter((x): x is string => Boolean(x)));
    removeIds = existing.variants.filter((v) => !keep.has(v.id)).map((v) => v.id);
    if (removeIds.length) {
      const refs = await prisma.orderItem.count({ where: { variantId: { in: removeIds } } });
      if (refs > 0) {
        throw conflict(
          "Cannot remove a variant that appears in order history — set its stock to 0 instead, or archive the product."
        );
      }
    }
  }

  const data: Prisma.ProductUncheckedUpdateInput = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.sku !== undefined) data.sku = body.sku;
  if (slug !== undefined) data.slug = slug;
  if (body.brandId !== undefined) data.brandId = body.brandId;
  if (body.categoryId !== undefined) data.categoryId = body.categoryId;
  if (body.price !== undefined) data.price = body.price;
  if (body.compareAtPrice !== undefined) data.compareAtPrice = body.compareAtPrice;
  if (body.discountPercent !== undefined) data.discountPercent = body.discountPercent;
  if (body.stock !== undefined) data.stock = body.stock;
  if (body.lowStockThreshold !== undefined) data.lowStockThreshold = body.lowStockThreshold;
  if (body.status !== undefined) data.status = body.status;
  if (body.isFeatured !== undefined) data.isFeatured = body.isFeatured;
  if (body.isBestseller !== undefined) data.isBestseller = body.isBestseller;
  if (body.newArrival !== undefined) data.newArrival = body.newArrival;
  if (body.isDeal !== undefined) data.isDeal = body.isDeal;
  if (body.shortDescription !== undefined) data.shortDescription = body.shortDescription;
  if (body.description !== undefined) data.description = body.description;
  const colors = toJsonColumn(body.colors);
  if (colors !== undefined) data.colors = colors;
  const sizes = toJsonColumn(body.sizes);
  if (sizes !== undefined) data.sizes = sizes;
  if (body.seoTitle !== undefined) data.seoTitle = body.seoTitle;
  if (body.seoDescription !== undefined) data.seoDescription = body.seoDescription;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id }, data });

      // Images: array index = position (full replace when provided).
      if (body.images !== undefined) {
        await tx.productImage.deleteMany({ where: { productId: id } });
        if (body.images.length) {
          await tx.productImage.createMany({
            data: body.images.map((img, i) => ({
              productId: id,
              url: img.url,
              alt: img.alt ?? null,
              position: i,
            })),
          });
        }
      }

      // Variants: update by id, create new, delete removed rows.
      if (incoming !== undefined) {
        if (removeIds.length) {
          await tx.productVariant.deleteMany({ where: { id: { in: removeIds } } });
        }
        let position = 0;
        for (const v of incoming) {
          const row = {
            sku: v.sku.trim(),
            color: v.color ?? null,
            size: v.size ?? null,
            price: v.price ?? null,
            stock: v.stock,
            position: position++,
          };
          if (v.id) await tx.productVariant.update({ where: { id: v.id }, data: row });
          else await tx.productVariant.create({ data: { productId: id, ...row } });
        }
      }
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw conflict("Another variant with the same SKU or color/size combination already exists");
    }
    throw err;
  }

  const details: Record<string, unknown> = { name: body.name ?? existing.name };
  if (body.status !== undefined && body.status !== existing.status) {
    details.status = { from: existing.status, to: body.status };
  }
  if (body.stock !== undefined && body.stock !== existing.stock) {
    details.stock = { from: existing.stock, to: body.stock };
  }
  if (incoming !== undefined) details.variants = { count: incoming.length, removed: removeIds.length };
  if (body.images !== undefined) details.images = body.images.length;

  await audit({
    adminId: admin.id,
    action: "PRODUCT_UPDATE",
    entityType: "Product",
    entityId: id,
    details,
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({ id });
});

// ── DELETE /api/admin/products/[id] ────────────────────────
export const DELETE = withApi<Ctx>(async (req: NextRequest, ctx?: Ctx) => {
  const admin = await requirePermission("products.manage");
  const id = await idFrom(ctx);
  if (!id) throw notFound("Product not found");

  const existing = await prisma.product.findUnique({
    where: { id },
    select: { id: true, name: true, sku: true },
  });
  if (!existing) throw notFound("Product not found");

  const refs = await prisma.orderItem.count({ where: { productId: id } });
  if (refs > 0) {
    throw conflict(
      `This product appears in ${refs} order item${refs === 1 ? "" : "s"} — archive it (set status to ARCHIVED) instead of deleting to keep order history intact.`
    );
  }

  // images/variants/logs cascade via schema; cart/review rows cascade as well.
  await prisma.product.delete({ where: { id } });

  await audit({
    adminId: admin.id,
    action: "PRODUCT_DELETE",
    entityType: "Product",
    entityId: id,
    details: { name: existing.name, sku: existing.sku },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({ id });
});
