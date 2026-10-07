import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, rateLimit, clientIp } from "@/lib/api";
import { placeOrder } from "@/lib/order";
import { getSessionUser } from "@/lib/auth";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { availablePaymentMethods, getPaymentProvider } from "@/server/payment";
import { syncNewOrder } from "@/server/external-commerce/sync-order";
import { badRequest, unauthorized } from "@/lib/errors";
import { ApiError } from "@/lib/errors";
import { notifyNewOrderOnTelegram } from "@/lib/telegram";

const checkoutSchema = z.object({
  address: z.object({
    fullName: z.string().min(2, "Please enter the receiver's name").max(80),
    phone: z.string().regex(/^01[3-9]\d{8}$/, "Enter a valid BD mobile number"),
    email: z.string().email("Enter a valid email").optional().or(z.literal("")),
    division: z.string().min(2, "Select a division"),
    district: z.string().min(2, "Select a district"),
    area: z.string().min(1, "Select an area"),
    fullAddress: z.string().min(8, "Please enter the full address").max(300),
    instructions: z.string().max(300).optional().or(z.literal("")),
  }),
  paymentMethod: z.enum(["COD", "BKASH", "NAGAD", "CARD", "OTHER"]),
  /** Zone picked at checkout; omitted by older clients → district decides. */
  shippingZone: z.enum(["dhaka", "nationwide"]).optional(),
  couponCode: z.string().max(40).nullish(),
  customerNote: z.string().max(500).optional().or(z.literal("")),
  saveAddress: z.boolean().default(true),
  /**
   * Client-generated UUID — makes checkout replay-safe: a double click,
   * refresh or retried request returns the SAME order instead of creating
   * a second one.
   */
  idempotencyKey: z.string().min(16).max(80),
});

/**
 * Checkout: create order → save everything → forward to external API.
 *
 * Response reports the TRUE synchronization state (never fakes success):
 *   sync: { status, message, externalOrderId? }
 */
export const POST = withApi(async (req: NextRequest) => {
  rateLimit(`checkout:${clientIp(req)}`, 10, 60_000);

  const body = parseBody(checkoutSchema, await req.json().catch(() => ({})));

  // The zone must match the destination: the cheaper inside-Dhaka rate can
  // never be applied to an address outside Dhaka district (enforced here as
  // well as in the UI, so a hand-crafted request cannot underpay).
  if (body.shippingZone === "dhaka" && body.address.district !== "Dhaka") {
    throw badRequest("The Inside Dhaka delivery rate only applies to Dhaka district addresses");
  }

  // Checkout requires a signed-in account. Guests can browse and fill the
  // cart, but placing an order is only possible after login (the storefront
  // redirects to /auth/login?next=/checkout before this point).
  // Session lookup and the payment-method list are independent reads — run
  // them together (every DB round trip costs ~100 ms here).
  const [user, methods] = await Promise.all([getSessionUser(), availablePaymentMethods()]);
  if (!user) {
    throw unauthorized("Please sign in to continue to checkout");
  }
  const store = await cookies();
  const guest = store.get("imalissa_guest")?.value ?? null;

  // Payment method must be genuinely available (no fake gateways).
  if (!methods.some((m) => m.method === body.paymentMethod)) {
    throw badRequest("Selected payment method is not available right now");
  }

  const result = await placeOrder({
    userId: user.id,
    guestId: guest,
    address: body.address,
    paymentMethod: body.paymentMethod,
    shippingZone: body.shippingZone,
    couponCode: body.couponCode ?? null,
    customerNote: body.customerNote || null,
    idempotencyKey: body.idempotencyKey,
    saveAddress: body.saveAddress && Boolean(user),
  });

  // ── Telegram alert: the moment the order exists it lands in the
  // admin's chat (full checkout details + one photo per item).
  // Fire-and-forget — checkout never waits on or fails because of it;
  // the library logs both delivery and failure honestly.
  if (!result.alreadyExisted) {
    void notifyNewOrderOnTelegram(result.orderId);
  }

  // ── Init payment (COD instant, gateways would redirect) ─────────
  const provider = await getPaymentProvider(body.paymentMethod);
  try {
    await provider.init({
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      amount: result.total,
      currency: "BDT",
      customerPhone: body.address.phone,
      customerName: body.address.fullName,
      returnUrl: `${process.env.NEXT_PUBLIC_SITE_URL || ""}/account/orders/${result.orderNumber}`,
    });
  } catch (err) {
    // Gateway unavailable — order is saved as UNPAID; report honestly.
    if (err instanceof ApiError) throw err;
    // ExternalCommerceError (NOT_CONFIGURED etc.)
    const message = err instanceof Error ? err.message : "Payment method unavailable";
    throw badRequest(message);
  }

  // ── Forward to the boss's API (honest status) ───────────────────
  let sync: { status: string; message: string; externalOrderId?: string };
  if (result.alreadyExisted) {
    const order = await prisma.order.findUnique({
      where: { id: result.orderId },
      select: { externalSyncStatus: true, externalOrderId: true, lastSyncError: true },
    });
    sync = {
      status: String(order?.externalSyncStatus ?? "PENDING"),
      message: "This order was already submitted",
      externalOrderId: order?.externalOrderId ?? undefined,
    };
  } else {
    const outcome = await syncNewOrder(result.orderId);
    sync = { status: outcome.status, message: outcome.message, externalOrderId: outcome.externalOrderId };
  }

  return jsonOk({
    orderId: result.orderId,
    orderNumber: result.orderNumber,
    total: result.total,
    alreadyExisted: result.alreadyExisted,
    sync,
  });
});

export const dynamic = "force-dynamic";
