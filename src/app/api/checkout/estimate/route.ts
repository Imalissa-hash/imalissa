import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, rateLimit, clientIp } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { unauthorized, notFound, badRequest } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { roundMoney } from "@/lib/utils";
import { validateCouponForItems } from "@/lib/coupon";

/**
 * Estimate delivery charge + coupon discount for the checkout page.
 * POST { district, zone?, couponCode? } → { subtotal, discount, deliveryCharge, total }
 *
 * Two ways to get the charge:
 *   • zone      — the method the customer picked ("dhaka" | "nationwide");
 *                 the inside-Dhaka rate is refused for non-Dhaka addresses.
 *   • district  — legacy fallback: Dhaka district ৳80, any other ৳130.
 * `division` is accepted as a legacy fallback only when district is missing.
 */
export const POST = withApi(async (req: NextRequest) => {
  const body = parseBody(
    z.object({
      district: z.string().min(2).optional(),
      division: z.string().min(2).optional(),
      zone: z.enum(["dhaka", "nationwide"]).optional(),
      couponCode: z.string().max(40).nullish(),
    }),
    await req.json().catch(() => ({}))
  );
  const districtKey = body.district ?? body.division;
  if (!districtKey) throw badRequest("Select a delivery district");

  const user = await getSessionUser();
  const store = await (await import("next/headers")).cookies();
  const guest = store.get("imalissa_guest")?.value ?? null;

  const cart = await prisma.cart.findUnique({
    where: user ? { userId: user.id } : { sessionId: guest ?? "" },
    include: {
      items: { include: { product: { include: { category: { select: { id: true } } } } } },
    },
  });

  if (!cart || !cart.items.length) {
    return jsonOk({ subtotal: 0, discount: 0, deliveryCharge: 0, total: 0 });
  }

  const lines = cart.items
    .filter((i) => i.product && i.product.status === "ACTIVE")
    .map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      unitPrice: Number(i.product.price),
      categoryId: i.product.categoryId,
      lineTotal: roundMoney(Number(i.product.price) * i.quantity),
    }));

  const subtotal = roundMoney(lines.reduce((s, l) => s + l.lineTotal, 0));

  let discount = 0;
  let appliedCode: string | null = null;
  const code = body.couponCode ?? cart.couponCode;
  if (code) {
    try {
      const res = await validateCouponForItems(code, subtotal, user?.id ?? null, lines);
      discount = res.discount;
      appliedCode = res.code;
    } catch {
      discount = 0;
      appliedCode = null;
    }
  }

  const { calcDeliveryCharge, calcZoneCharge } = await import("@/lib/delivery");
  const afterDiscount = roundMoney(Math.max(subtotal - discount, 0));
  const deliveryCharge = body.zone
    ? await calcZoneCharge(body.zone, afterDiscount, districtKey)
    : await calcDeliveryCharge(districtKey, afterDiscount);

  return jsonOk({
    subtotal,
    discount,
    couponCode: appliedCode,
    deliveryCharge,
    total: roundMoney(afterDiscount + deliveryCharge),
  });
});

export const dynamic = "force-dynamic";
