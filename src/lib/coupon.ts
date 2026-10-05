import { prisma } from "./db";
import { badRequest } from "./errors";
import { roundMoney } from "./utils";

/**
 * Coupon engine — validates codes server-side and computes the discount.
 * Supported: percentage / fixed amount, min order, expiry, global and
 * per-user usage limits, optional product/category restrictions.
 */

export interface CouponResult {
  couponId: string;
  code: string;
  discount: number;
  description?: string | null;
}

export interface CouponDef {
  id: string;
  code: string;
  type: "PERCENTAGE" | "FIXED";
  value: number;
  minOrder: number;
  maxDiscount: number | null;
  expiresAt: Date | null;
  startsAt: Date | null;
  usageLimit: number | null;
  usedCount: number;
  perUserLimit: number;
  productIds: unknown;
  categoryIds: unknown;
  isActive: boolean;
}

export async function getCoupon(code: string) {
  return prisma.coupon.findUnique({ where: { code: code.toUpperCase().trim() } });
}

/**
 * Validate a coupon for the given subtotal/user and return the discount
 * amount. Throws ApiError(400) with a customer-facing reason when invalid.
 */
export async function validateCoupon(
  code: string,
  subtotal: number,
  userId?: string | null,
  applicableCategoryIds?: string[]
): Promise<CouponResult> {
  const coupon = await getCoupon(code);
  if (!coupon || !coupon.isActive) throw badRequest("This coupon code is not valid");

  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) throw badRequest("This coupon is not active yet");
  if (coupon.expiresAt && coupon.expiresAt < now) throw badRequest("This coupon has expired");

  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    throw badRequest("This coupon has reached its usage limit");
  }

  if (subtotal < Number(coupon.minOrder)) {
    throw badRequest(`Minimum order ${roundMoney(Number(coupon.minOrder))} required for this coupon`);
  }

  if (userId && coupon.perUserLimit > 0) {
    const used = await prisma.couponUsage.count({ where: { couponId: coupon.id, userId } });
    if (used >= coupon.perUserLimit) {
      throw badRequest("You have already used this coupon");
    }
  }

  // Restriction check happens at checkout when category context is available.
  let discount = 0;
  if (coupon.type === "PERCENTAGE") {
    discount = (subtotal * Number(coupon.value)) / 100;
    if (coupon.maxDiscount != null) discount = Math.min(discount, Number(coupon.maxDiscount));
  } else {
    discount = Number(coupon.value);
  }

  discount = Math.min(roundMoney(discount), subtotal);
  if (discount <= 0) throw badRequest("This coupon does not apply to your order");

  return {
    couponId: coupon.id,
    code: coupon.code,
    discount,
    description: coupon.description,
  };
}

/**
 * Restriction-aware validation used at checkout: verifies every item in the
 * order belongs to a product/category the coupon applies to.
 */
export async function validateCouponForItems(
  code: string,
  subtotal: number,
  userId: string | null,
  items: { productId: string; categoryId: string; lineTotal: number }[]
): Promise<CouponResult> {
  const result = await validateCoupon(code, subtotal, userId);
  const coupon = await getCoupon(code);
  if (!coupon) throw badRequest("This coupon code is not valid");

  const productIds = (coupon.productIds as string[] | null) ?? [];
  const categoryIds = (coupon.categoryIds as string[] | null) ?? [];

  if (productIds.length === 0 && categoryIds.length === 0) return result;

  const eligibleSum = items
    .filter(
      (i) =>
        (productIds.length === 0 || productIds.includes(i.productId)) &&
        (categoryIds.length === 0 || categoryIds.includes(i.categoryId))
    )
    .reduce((sum, i) => sum + i.lineTotal, 0);

  if (eligibleSum <= 0) throw badRequest("This coupon is not valid for the items in your cart");

  // Recompute discount against only the eligible amount.
  let discount: number;
  if (coupon.type === "PERCENTAGE") {
    discount = (eligibleSum * Number(coupon.value)) / 100;
    if (coupon.maxDiscount != null) discount = Math.min(discount, Number(coupon.maxDiscount));
  } else {
    discount = Math.min(Number(coupon.value), eligibleSum);
  }

  discount = roundMoney(discount);
  if (discount <= 0) throw badRequest("This coupon does not apply to your order");

  return { couponId: coupon.id, code: coupon.code, discount, description: coupon.description };
}
