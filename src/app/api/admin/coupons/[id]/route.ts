import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma, type Coupon } from "@prisma/client";
import { withApi, jsonOk, parseBody, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { badRequest, conflict, notFound } from "@/lib/errors";
import type { CouponRow } from "@/components/admin/content/CouponsClient";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const idFrom = async (ctx?: Ctx): Promise<string> => (await ctx?.params)?.id ?? "";

// ── Zod helpers (same contract as /api/admin/coupons) ─────
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

const intOrNull = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === undefined ? undefined : v === "" || v === null ? null : Number(v)),
    z.number().int().min(min).max(max).nullable().optional()
  );

const intOpt = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === undefined || v === "" ? undefined : v === null ? NaN : Number(v)),
    z.number().int().min(min).max(max).optional()
  );

const textOrNull = (max: number) =>
  z.preprocess(
    (v) => (v === undefined ? undefined : v === null || (typeof v === "string" && !v.trim()) ? null : v),
    z.string().trim().max(max, `Too long (max ${max} characters)`).nullable().optional()
  );

const dateStr = z.preprocess(
  (v) => (v === undefined ? undefined : v === null || (typeof v === "string" && !v.trim()) ? null : v),
  z.string().max(60, "Invalid date").nullable().optional()
);

const couponBody = z.object({
  code: z.string().trim().min(3, "Code must be at least 3 characters").max(32, "Code is too long (max 32 characters)"),
  type: z.enum(["PERCENTAGE", "FIXED"]),
  value: numRequired(0.01),
  minOrder: numOrNull(0),
  maxDiscount: numOrNull(0),
  startsAt: dateStr,
  endsAt: dateStr,
  usageLimit: intOrNull(1, 1_000_000),
  perUserLimit: intOpt(0, 100_000),
  description: textOrNull(500),
  isActive: z.boolean().optional(),
});

const patchSchema = couponBody.partial();

// ── Shared validation (mirrors /api/admin/coupons) ────────
function toDateOrNull(value: string | null | undefined, field: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw badRequest(`${field}: Invalid date`);
  return d;
}

function assertCouponValues(v: {
  type: "PERCENTAGE" | "FIXED";
  value: number;
  minOrder: number;
  startsAt?: Date | null;
  expiresAt?: Date | null;
  usageLimit?: number | null;
  usedCount: number;
}): void {
  if (v.type === "PERCENTAGE" && (v.value < 1 || v.value > 100)) {
    throw badRequest("value: Percentage discounts must be between 1 and 100");
  }
  if (v.type === "FIXED" && v.value > v.minOrder) {
    throw badRequest(
      `minOrder: For a fixed ${v.value} discount the minimum order must be at least ${v.value} so the total can never drop below zero`
    );
  }
  if (v.startsAt && v.expiresAt && v.expiresAt.getTime() <= v.startsAt.getTime()) {
    throw badRequest("endsAt: The end date must be after the start date");
  }
  if (v.usageLimit != null && v.usageLimit < v.usedCount) {
    throw badRequest(
      `usageLimit: Cannot be lower than the ${v.usedCount} time(s) this coupon was already used`
    );
  }
}

function toRow(c: Coupon): CouponRow {
  return {
    id: c.id,
    code: c.code,
    type: c.type,
    value: Number(c.value),
    minOrder: Number(c.minOrder),
    maxDiscount: c.maxDiscount != null ? Number(c.maxDiscount) : null,
    startsAt: c.startsAt ? new Date(c.startsAt).toISOString() : null,
    expiresAt: c.expiresAt ? new Date(c.expiresAt).toISOString() : null,
    usageLimit: c.usageLimit,
    usedCount: c.usedCount,
    perUserLimit: c.perUserLimit,
    isActive: c.isActive,
    description: c.description,
    createdAt: new Date(c.createdAt).toISOString(),
  };
}

// ── GET /api/admin/coupons/[id] — full detail ─────────────
export const GET = withApi<Ctx>(async (req: NextRequest, ctx?: Ctx) => {
  await requirePermission("coupons.view");
  const id = await idFrom(ctx);
  if (!id) throw notFound("Coupon not found");

  const coupon = await prisma.coupon.findUnique({ where: { id } });
  if (!coupon) throw notFound("Coupon not found");

  return jsonOk(toRow(coupon));
});

// ── PATCH /api/admin/coupons/[id] — partial update ────────
export const PATCH = withApi<Ctx>(async (req: NextRequest, ctx?: Ctx) => {
  const admin = await requirePermission("coupons.manage");
  const id = await idFrom(ctx);
  if (!id) throw notFound("Coupon not found");

  const existing = await prisma.coupon.findUnique({ where: { id } });
  if (!existing) throw notFound("Coupon not found");

  const body = parseBody(patchSchema, await req.json().catch(() => ({})));

  let code: string | undefined;
  if (body.code !== undefined) {
    code = body.code.toUpperCase();
    if (!/^[A-Z0-9_-]+$/.test(code)) {
      throw badRequest("code: Use only letters, numbers, dashes or underscores");
    }
    const dup = await prisma.coupon.findUnique({ where: { code }, select: { id: true } });
    if (dup && dup.id !== id) throw conflict(`Coupon code "${code}" already exists`);
  }

  // Validate the *effective* values after this patch.
  const type = body.type ?? existing.type;
  const value = body.value !== undefined ? body.value : Number(existing.value);
  const minOrder = body.minOrder !== undefined ? body.minOrder ?? 0 : Number(existing.minOrder);
  const startsAt = toDateOrNull(body.startsAt, "startsAt");
  const expiresAt = toDateOrNull(body.endsAt, "endsAt");
  assertCouponValues({
    type,
    value,
    minOrder,
    startsAt: startsAt !== undefined ? startsAt : existing.startsAt,
    expiresAt: expiresAt !== undefined ? expiresAt : existing.expiresAt,
    usageLimit: body.usageLimit !== undefined ? body.usageLimit : existing.usageLimit,
    usedCount: existing.usedCount,
  });

  const data: Prisma.CouponUncheckedUpdateInput = {};
  if (code !== undefined) data.code = code;
  if (body.type !== undefined) data.type = body.type;
  if (body.value !== undefined) data.value = body.value;
  if (body.minOrder !== undefined) data.minOrder = minOrder;
  if (body.maxDiscount !== undefined) data.maxDiscount = body.maxDiscount;
  if (startsAt !== undefined) data.startsAt = startsAt;
  if (expiresAt !== undefined) data.expiresAt = expiresAt;
  if (body.usageLimit !== undefined) data.usageLimit = body.usageLimit;
  if (body.perUserLimit !== undefined) data.perUserLimit = body.perUserLimit;
  if (body.description !== undefined) data.description = body.description;
  if (body.isActive !== undefined) data.isActive = body.isActive;

  try {
    await prisma.coupon.update({ where: { id }, data });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw conflict(`Coupon code "${code}" already exists`);
    }
    throw err;
  }

  const details: Record<string, unknown> = { code: code ?? existing.code };
  if (body.isActive !== undefined && body.isActive !== existing.isActive) {
    details.isActive = { from: existing.isActive, to: body.isActive };
  }
  if (body.type !== undefined && body.type !== existing.type) {
    details.type = { from: existing.type, to: body.type };
  }
  if (body.value !== undefined && body.value !== Number(existing.value)) {
    details.value = { from: Number(existing.value), to: body.value };
  }

  await audit({
    adminId: admin.id,
    action: "COUPON_UPDATE",
    entityType: "Coupon",
    entityId: id,
    details,
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({ id });
});

// ── DELETE /api/admin/coupons/[id] ────────────────────────
export const DELETE = withApi<Ctx>(async (req: NextRequest, ctx?: Ctx) => {
  const admin = await requirePermission("coupons.manage");
  const id = await idFrom(ctx);
  if (!id) throw notFound("Coupon not found");

  const existing = await prisma.coupon.findUnique({
    where: { id },
    select: { id: true, code: true, usedCount: true },
  });
  if (!existing) throw notFound("Coupon not found");

  // CouponUsage cascades with the coupon — deleting used coupons would erase
  // usage history, so require deactivation instead (mirrors the product guard).
  const usages = await prisma.couponUsage.count({ where: { couponId: id } });
  if (usages > 0) {
    throw conflict(
      `“${existing.code}” has been used ${usages} time${usages === 1 ? "" : "s"} — deactivate it instead of deleting to keep usage history intact.`
    );
  }

  await prisma.coupon.delete({ where: { id } });

  await audit({
    adminId: admin.id,
    action: "COUPON_DELETE",
    entityType: "Coupon",
    entityId: id,
    details: { code: existing.code },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({ id });
});
