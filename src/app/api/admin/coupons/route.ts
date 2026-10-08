import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma, type Coupon } from "@prisma/client";
import { withApi, jsonOk, parseBody, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { badRequest, conflict } from "@/lib/errors";
import type { CouponRow } from "@/components/admin/content/CouponsClient";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

// ── Zod helpers (same contract as /api/admin/products) ─────
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

/** Nullable Prisma Int: "" / null → null (clear), absent → no change, NaN → rejected. */
const intOrNull = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === undefined ? undefined : v === "" || v === null ? null : Number(v)),
    z.number().int().min(min).max(max).nullable().optional()
  );

/** Non-nullable Prisma Int: "" → no change, null → rejected, NaN → rejected. */
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

/** ISO date string | "" | null; converted to a Date in the handlers. */
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

const createSchema = couponBody;
const patchSchema = couponBody.partial();

// ── Shared validation (create + patch validate effective values) ──
function toDateOrNull(value: string | null | undefined, field: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw badRequest(`${field}: Invalid date`);
  return d;
}

/** Business rules for the effective coupon values (this module only stores the
 *  record — checkout computes the actual pricing via lib/coupon.ts). */
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

// ── Serialization (Prisma Decimal/Date → plain JSON) ──────
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

/** Parse ?active=1|0|true|false (empty = no filter). */
function parseActive(raw: string): boolean | undefined {
  const v = raw.trim().toLowerCase();
  if (v === "" ) return undefined;
  if (v === "1" || v === "true") return true;
  if (v === "0" || v === "false") return false;
  throw badRequest("Invalid active filter — use 1 or 0");
}

// ── GET /api/admin/coupons — list (q / active / page) ─────
export const GET = withApi(async (req: NextRequest) => {
  await requirePermission("coupons.view");

  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").trim();
  const isActive = parseActive(sp.get("active") ?? "");
  const requestedPage = Math.max(1, Number(sp.get("page")) || 1);

  const where: Prisma.CouponWhereInput = {};
  if (q) where.OR = [{ code: { contains: q } }, { description: { contains: q } }];
  if (isActive !== undefined) where.isActive = isActive;

  const total = await prisma.coupon.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const rows = await prisma.coupon.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  return jsonOk({ items: rows.map(toRow), total, totalPages, page });
});

// ── POST /api/admin/coupons — create ──────────────────────
export const POST = withApi(async (req: NextRequest) => {
  const admin = await requirePermission("coupons.manage");
  const body = parseBody(createSchema, await req.json().catch(() => ({})));

  const code = body.code.toUpperCase();
  if (!/^[A-Z0-9_-]+$/.test(code)) {
    throw badRequest("code: Use only letters, numbers, dashes or underscores");
  }

  const taken = await prisma.coupon.findUnique({ where: { code }, select: { id: true } });
  if (taken) throw conflict(`Coupon code "${code}" already exists`);

  const startsAt = toDateOrNull(body.startsAt, "startsAt");
  const expiresAt = toDateOrNull(body.endsAt, "endsAt");
  const minOrder = body.minOrder ?? 0;
  assertCouponValues({
    type: body.type,
    value: body.value,
    minOrder,
    startsAt,
    expiresAt,
    usageLimit: body.usageLimit ?? null,
    usedCount: 0,
  });

  let coupon: { id: string };
  try {
    coupon = await prisma.coupon.create({
      data: {
        code,
        type: body.type,
        value: body.value,
        minOrder,
        maxDiscount: body.maxDiscount ?? null,
        startsAt: startsAt ?? null,
        expiresAt: expiresAt ?? null,
        usageLimit: body.usageLimit ?? null,
        perUserLimit: body.perUserLimit ?? 1,
        description: body.description ?? null,
        isActive: body.isActive ?? true,
      },
      select: { id: true },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw conflict(`Coupon code "${code}" already exists`);
    }
    throw err;
  }

  await audit({
    adminId: admin.id,
    action: "COUPON_CREATE",
    entityType: "Coupon",
    entityId: coupon.id,
    details: { code, type: body.type, value: body.value, minOrder },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({ id: coupon.id, code });
});
