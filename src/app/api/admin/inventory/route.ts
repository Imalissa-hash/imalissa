import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withApi, jsonOk, parseBody, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { variantLabel } from "@/lib/utils";
import type { InventoryCounts, InventoryRow } from "@/components/admin/catalog/InventoryClient";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

// ── Zod ─────────────────────────────────────────────────────
const toNullIfBlank = (v: unknown) => (v === "" || v === null ? null : v);

const adjustSchema = z.object({
  productId: z.string().trim().min(1, "Choose a product"),
  variantId: z.preprocess(toNullIfBlank, z.string().trim().min(1).nullable().optional()),
  delta: z.preprocess(
    (v) => (v === undefined || v === "" || v === null ? NaN : Number(v)),
    z
      .number()
      .int("Change must be a whole number")
      .refine((n) => n !== 0, "Change must not be zero")
      .refine((n) => Math.abs(n) <= 100000, "Change is too large")
  ),
  reason: z.string().trim().min(2, "Provide a reason for the adjustment").max(200),
});

// ── Serialization ───────────────────────────────────────────
interface InvSource {
  id: string;
  name: string;
  sku: string;
  status: string;
  stock: number;
  lowStockThreshold: number;
  images: { url: string }[];
  variants: {
    id: string;
    sku: string;
    color: string | null;
    size: string | null;
    stock: number;
    price: unknown;
  }[];
}

function toRow(p: InvSource): InventoryRow {
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    status: p.status,
    stock: p.stock,
    lowStockThreshold: p.lowStockThreshold,
    image: p.images[0]?.url ?? null,
    variantCount: p.variants.length,
    variants: p.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      color: v.color,
      size: v.size,
      label: variantLabel(v.color, v.size),
      stock: v.stock,
      price: v.price != null ? Number(v.price) : null,
    })),
  };
}

/** low = above zero but at/below the product threshold; out = zero or below. */
const isLow = (p: { stock: number; lowStockThreshold: number }) =>
  p.stock > 0 && p.stock <= p.lowStockThreshold;
const isOut = (p: { stock: number }) => p.stock <= 0;

// ── GET /api/admin/inventory ───────────────────────────────
export const GET = withApi(async (req: NextRequest) => {
  await requireAdmin();

  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").trim();
  const stock = sp.get("stock") ?? "";
  const requestedPage = Math.max(1, Number(sp.get("page")) || 1);
  if (stock && stock !== "low" && stock !== "out") throw badRequest("Invalid stock filter");

  const where: Prisma.ProductWhereInput = {};
  if (q) where.OR = [{ name: { contains: q } }, { sku: { contains: q } }];

  const rows = await prisma.product.findMany({
    where,
    orderBy: [{ stock: "asc" }, { name: "asc" }],
    include: {
      images: { orderBy: { position: "asc" }, take: 1 },
      variants: { orderBy: { position: "asc" } },
    },
  });

  const counts: InventoryCounts = {
    all: rows.length,
    low: rows.filter(isLow).length,
    out: rows.filter(isOut).length,
  };

  const filtered = stock === "low" ? rows.filter(isLow) : stock === "out" ? rows.filter(isOut) : rows;
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const items = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(toRow);

  return jsonOk({ items, total, totalPages, page, counts });
});

// ── PATCH /api/admin/inventory — atomic stock adjustment ───
export const PATCH = withApi(async (req: NextRequest) => {
  const admin = await requireAdmin();
  const body = parseBody(adjustSchema, await req.json().catch(() => ({})));
  const variantId = body.variantId ?? null;
  const { productId, delta, reason } = body;

  const result = await prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { id: true, stock: true },
    });
    if (!product) throw notFound("Product not found");

    if (variantId) {
      const variant = await tx.productVariant.findUnique({
        where: { id: variantId },
        select: { id: true, productId: true, stock: true },
      });
      if (!variant || variant.productId !== productId) {
        throw notFound("Variant not found for this product");
      }

      // Single conditional UPDATE — the gte guard is atomic at the DB level.
      const updated = await tx.productVariant.updateMany({
        where: delta < 0 ? { id: variantId, stock: { gte: -delta } } : { id: variantId },
        data: { stock: { increment: delta } },
      });
      if (updated.count === 0) {
        throw conflict(`Only ${variant.stock} in stock — cannot remove ${-delta}`);
      }

      const balanceAfter = variant.stock + delta;
      await tx.inventoryLog.create({
        data: {
          productId,
          variantId,
          change: delta,
          balanceAfter,
          reason,
          actorId: admin.id,
        },
      });
      return { balanceAfter, target: "variant" as const };
    }

    const updated = await tx.product.updateMany({
      where: delta < 0 ? { id: productId, stock: { gte: -delta } } : { id: productId },
      data: { stock: { increment: delta } },
    });
    if (updated.count === 0) {
      throw conflict(`Only ${product.stock} in stock — cannot remove ${-delta}`);
    }

    const balanceAfter = product.stock + delta;
    await tx.inventoryLog.create({
      data: { productId, change: delta, balanceAfter, reason, actorId: admin.id },
    });
    return { balanceAfter, target: "product" as const };
  });

  await audit({
    adminId: admin.id,
    action: "STOCK_ADJUST",
    entityType: "Product",
    entityId: productId,
    details: {
      variantId,
      delta,
      reason,
      balanceAfter: result.balanceAfter,
      target: result.target,
    },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({
    balanceAfter: result.balanceAfter,
    target: result.target,
    productId,
    variantId,
  });
});
