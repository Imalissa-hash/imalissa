import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { badRequest, conflict, notFound } from "@/lib/errors";

export const dynamic = "force-dynamic";

// ── Zod ─────────────────────────────────────────────────────
const toNullIfBlank = (v: unknown) => (v === "" || v === null ? null : v);

const numOrNull = (min: number) =>
  z.preprocess(
    (v) => (v === undefined || v === "" || v === null ? null : Number(v)),
    z
      .number()
      .min(min, `Must be ${min} or more`)
      .nullable()
      .optional()
  );

const editSchema = z.object({
  variantId: z.string().trim().min(1, "Choose a variant"),
  sku: z.string().trim().min(1, "SKU is required").max(64),
  color: z.preprocess(toNullIfBlank, z.string().trim().max(64).nullable().optional()),
  size: z.preprocess(toNullIfBlank, z.string().trim().max(32).nullable().optional()),
  price: numOrNull(0),
});

// ── PATCH /api/admin/inventory/variant ──────────────────────
// Edits a variant's identity fields only (SKU / colour / size / price).
// Stock is deliberately NOT writable here — it must go through the
// product route's atomic adjustment, which writes an InventoryLog row
// and refuses to drive a balance below zero. Allowing it twice would
// create a second, unaudited way to mutate stock.
export const PATCH = withApi(async (req: NextRequest) => {
  const admin = await requirePermission("inventory.manage");
  const body = parseBody(editSchema, await req.json().catch(() => ({})));

  const { variantId, sku, color, size, price } = body;
  const nextSku = sku.trim();

  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: { id: true, productId: true, sku: true, color: true, size: true, price: true },
  });
  if (!variant) throw notFound("Variant not found");

  // sku is globally @unique in the schema.
  if (nextSku !== variant.sku) {
    const taken = await prisma.productVariant.findUnique({
      where: { sku: nextSku },
      select: { id: true },
    });
    if (taken) throw conflict(`SKU "${nextSku}" is already used by another variant`);
  }

  // @@unique([productId, color, size]) — only enforced when both parts
  // are present, matching MySQL's treatment of NULLs as distinct.
  const nextColor = color ?? null;
  const nextSize = size ?? null;
  if (nextColor && nextSize) {
    const clash = await prisma.productVariant.findFirst({
      where: {
        productId: variant.productId,
        color: nextColor,
        size: nextSize,
        NOT: { id: variantId },
      },
      select: { id: true },
    });
    if (clash) throw conflict(`${nextColor} / ${nextSize} already exists on this product`);
  }

  const updated = await prisma.productVariant.update({
    where: { id: variantId },
    data: { sku: nextSku, color: nextColor, size: nextSize, price: price ?? null },
    select: { id: true, sku: true, color: true, size: true, price: true, stock: true },
  });

  await audit({
    adminId: admin.id,
    action: "VARIANT_EDIT",
    entityType: "ProductVariant",
    entityId: variantId,
    details: {
      productId: variant.productId,
      before: { sku: variant.sku, color: variant.color, size: variant.size, price: variant.price },
      after: { sku: updated.sku, color: updated.color, size: updated.size, price: updated.price },
    },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({
    id: updated.id,
    sku: updated.sku,
    color: updated.color,
    size: updated.size,
    price: updated.price != null ? Number(updated.price) : null,
    stock: updated.stock,
  });
});
