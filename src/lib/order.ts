import { prisma } from "./db";
import { ApiError, badRequest, notFound } from "./errors";
import { roundMoney } from "./utils";
import { computeTotals, zoneForDistrict, type CheckoutItemInput, type ShippingZone } from "./delivery";
import { priceCart } from "./cart";

/**
 * Order placement.
 *
 * Correctness properties:
 *  - Prices/totals are always recomputed server-side from the catalog.
 *  - Stock is decremented atomically with a `stock >= qty` guard, so two
 *    simultaneous buyers can never oversell the same unit.
 *  - The whole order (items, payment, cart clear, coupon usage) commits in
 *    ONE transaction — either everything is saved or nothing is.
 *  - Order.idempotencyKey is UNIQUE: replaying the same checkout request
 *    (double-click, refresh, retried fetch) returns the existing order
 *    instead of creating a duplicate.
 */

export interface CheckoutAddress {
  fullName: string;
  phone: string;
  email?: string;
  division: string;
  district: string;
  area: string;
  fullAddress: string;
  instructions?: string;
}

export interface PlaceOrderParams {
  userId: string | null;
  guestId: string | null;
  address: CheckoutAddress;
  paymentMethod: "COD" | "BKASH" | "NAGAD" | "CARD" | "OTHER";
  couponCode?: string | null;
  customerNote?: string | null;
  /** Client-generated UUID — replay-safe checkout. */
  idempotencyKey: string;
  /**
   * Shipping zone the customer selected at checkout ("dhaka" | "nationwide").
   * Omitted → derived from the address district (legacy clients).
   */
  shippingZone?: ShippingZone;
  /** Optional saved address id to prefill validation against. */
  saveAddress?: boolean;
  /** @internal Set after one automatic retry from a dropped transaction. */
  __txRetry?: boolean;
}

export interface PlaceOrderResult {
  orderId: string;
  orderNumber: string;
  alreadyExisted: boolean;
  total: number;
}

/** Generate the next IMAL-YYYY-NNNNNN number inside the transaction. */
async function nextOrderNumber(tx: PrismaTx): Promise<string> {
  const year = new Date().getFullYear();

  // Row lock via UPDATE guarantees serialization across concurrent checkouts.
  await tx.$executeRaw`
    INSERT INTO OrderSequence (year, seq)
    VALUES (${year}, 1)
    ON DUPLICATE KEY UPDATE seq = seq + 1
  `;

  const rows = await tx.$queryRaw<{ seq: number }[]>`
    SELECT seq FROM OrderSequence WHERE year = ${year}
  `;

  const seq = Number(rows?.[0]?.seq ?? 1);
  return `IMAL-${year}-${String(seq).padStart(6, "0")}`;
}

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Interactive-transaction limits for order placement. Generous so a cold DB
 * connection can never abort an order mid-flight (P2028), but bounded so a
 * genuinely stuck query fails fast instead of hanging the checkout.
 */
const ORDER_TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

export async function placeOrder(params: PlaceOrderParams): Promise<PlaceOrderResult> {
  const { userId, guestId, address, paymentMethod, idempotencyKey } = params;

  // ── Replay guard: same request already produced an order? ──────────
  const existing = await prisma.order.findUnique({
    where: { idempotencyKey },
    select: { id: true, orderNumber: true, total: true },
  });
  if (existing) {
    return {
      orderId: existing.id,
      orderNumber: existing.orderNumber,
      alreadyExisted: true,
      total: Number(existing.total),
    };
  }

  // ── Load & price the cart (server-side truth) ──────────────────────
  const cart = await prisma.cart.findUnique({
    where: userId ? { userId } : { sessionId: guestId ?? "" },
    include: {
      items: {
        include: {
          product: { include: { images: { orderBy: { position: "asc" }, take: 1 } } },
          variant: true,
        },
      },
    },
  });

  if (!cart || cart.items.length === 0) {
    throw badRequest("Your cart is empty");
  }

  const orderItems: (CheckoutItemInput & {
    variantId: string | null;
    name: string;
    slug: string;
    sku: string;
    variantLabel: string | null;
    image: string | null;
    productId: string;
  })[] = [];

  for (const item of cart.items) {
    const product = item.product;
    if (!product || product.status !== "ACTIVE") {
      throw badRequest(`"${product?.name ?? "An item"}" is no longer available`);
    }

    const unitPrice =
      item.variant?.price != null ? Number(item.variant.price) : Number(product.price);
    const lineTotal = roundMoney(unitPrice * item.quantity);
    const image = product.images[0]?.url ?? null;
    const variantLabel =
      [item.color, item.size].filter(Boolean).join(" / ") || null;

    orderItems.push({
      productId: product.id,
      variantId: item.variantId,
      name: product.name,
      slug: product.slug,
      sku: item.variant?.sku ?? product.sku,
      variantLabel,
      image,
      quantity: item.quantity,
      unitPrice,
      lineTotal,
      categoryId: product.categoryId,
    });
  }

  // ── Totals (server-computed, coupon validated) ─────────────────────
  // Charge comes from the zone the customer picked; if none was sent it is
  // derived from the delivery jela. Either way the server holds the two
  // Settings numbers — the client can only choose, never set, a price.
  const shippingZone = params.shippingZone ?? zoneForDistrict(address.district);
  const totals = await computeTotals(
    orderItems,
    address.district,
    params.couponCode ?? cart.couponCode ?? null,
    userId,
    shippingZone
  );

  // ── Commit everything atomically ───────────────────────────────────
  try {
    const order = await prisma.$transaction(async (tx) => {
      // 1. Reserve stock (atomic conditional decrement — no overselling).
      for (const line of orderItems) {
        if (line.variantId) {
          const res = await tx.productVariant.updateMany({
            where: { id: line.variantId, stock: { gte: line.quantity } },
            data: { stock: { decrement: line.quantity } },
          });
          if (res.count === 0) {
            const v = await tx.productVariant.findUnique({ where: { id: line.variantId } });
            throw badRequest(
              `Sorry, "${line.name}"${line.variantLabel ? ` (${line.variantLabel})` : ""} only has ${v?.stock ?? 0} left`
            );
          }
          await tx.product.update({
            where: { id: line.productId },
            data: { stock: { decrement: line.quantity }, soldCount: { increment: line.quantity } },
          });
        } else {
          const res = await tx.product.updateMany({
            where: { id: line.productId, stock: { gte: line.quantity } },
            data: { stock: { decrement: line.quantity } },
          });
          if (res.count === 0) {
            const p = await tx.product.findUnique({ where: { id: line.productId } });
            throw badRequest(
              `Sorry, "${line.name}" only has ${p?.stock ?? 0} left in stock`
            );
          }
          await tx.product.update({
            where: { id: line.productId },
            data: { soldCount: { increment: line.quantity } },
          });
        }
      }

      // 2. Order number (serialized by OrderSequence row lock).
      const orderNumber = await nextOrderNumber(tx);

      // 3. Create the order.
      const created = await tx.order.create({
        data: {
          orderNumber,
          idempotencyKey,
          userId: userId ?? undefined,
          guestEmail: address.email ?? null,
          guestPhone: address.phone,
          customerName: address.fullName,
          customerPhone: address.phone,
          customerEmail: address.email ?? null,
          status: "PENDING",
          paymentMethod,
          paymentStatus: "UNPAID",
          subtotal: totals.subtotal,
          discount: totals.discount,
          couponCode: totals.couponCode,
          couponId: totals.couponCode
            ? (await tx.coupon.findUnique({ where: { code: totals.couponCode! } }))?.id ?? null
            : null,
          deliveryCharge: totals.deliveryCharge,
          total: totals.total,
          address: {
            fullName: address.fullName,
            phone: address.phone,
            email: address.email ?? null,
            division: address.division,
            district: address.district,
            area: address.area,
            fullAddress: address.fullAddress,
            instructions: address.instructions ?? null,
          },
          instructions: address.instructions ?? null,
          customerNote: params.customerNote ?? null,
          externalSyncStatus: "PENDING",
        },
      });

      // 4. Line items (snapshots).
      for (const line of orderItems) {
        await tx.orderItem.create({
          data: {
            orderId: created.id,
            productId: line.productId,
            variantId: line.variantId,
            productName: line.name,
            productSlug: line.slug,
            sku: line.sku,
            variantLabel: line.variantLabel,
            image: line.image,
            unitPrice: line.unitPrice,
            lineDiscount: 0,
            quantity: line.quantity,
            lineTotal: line.lineTotal,
            externalProductRef: (
              await tx.externalProductMapping.findUnique({
                where: { productId: line.productId },
                select: { externalId: true },
              })
            )?.externalId ?? null,
          },
        });

        // 5. Inventory ledger.
        await tx.inventoryLog.create({
          data: {
            productId: line.productId,
            variantId: line.variantId,
            change: -line.quantity,
            balanceAfter: 0, // exact balance re-derived in admin inventory view
            reason: `Order ${orderNumber}`,
            orderId: created.id,
          },
        });
      }

      // 6. Payment record.
      await tx.payment.create({
        data: {
          orderId: created.id,
          method: paymentMethod,
          amount: totals.total,
          status: "UNPAID",
        },
      });

      // 7. Coupon usage bookkeeping.
      if (totals.couponCode) {
        const coupon = await tx.coupon.findUnique({ where: { code: totals.couponCode } });
        if (coupon) {
          await tx.coupon.update({
            where: { id: coupon.id },
            data: { usedCount: { increment: 1 } },
          });
          await tx.couponUsage.create({
            data: {
              couponId: coupon.id,
              userId: userId ?? undefined,
              orderId: created.id,
              amount: totals.discount,
            },
          });
        }
      }

      // 8. Clear the cart in the same transaction.
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      await tx.cart.update({ where: { id: cart.id }, data: { couponCode: null } });

      // 9. Save the address for logged-in customers.
      if (userId && params.saveAddress !== false) {
        const dup = await tx.address.findFirst({
          where: {
            userId,
            fullName: address.fullName,
            phone: address.phone,
            district: address.district,
            fullAddress: address.fullAddress,
          },
        });
        if (!dup) {
          const hasAny = await tx.address.count({ where: { userId } });
          await tx.address.create({
            data: {
              userId,
              fullName: address.fullName,
              phone: address.phone,
              email: address.email,
              division: address.division,
              district: address.district,
              area: address.area,
              fullAddress: address.fullAddress,
              instructions: address.instructions,
              isDefault: hasAny === 0,
            },
          });
        }
      }

      // 10. Internal notification for admins (unassigned userId = system).
      await tx.notification.create({
        data: {
          orderId: created.id,
          type: "ORDER",
          title: `New order ${orderNumber}`,
          body: `${address.fullName} · ${formatBdtSafe(totals.total)} · ${paymentMethod}`,
          link: `/admin/orders/${orderNumber}`,
        },
      });

      return created;
    }, ORDER_TX_OPTIONS);

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      alreadyExisted: false,
      total: Number(order.total),
    };
  } catch (err: unknown) {
    // Race: another request with the same idempotency key won the insert.
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      const winner = await prisma.order.findUnique({
        where: { idempotencyKey },
        select: { id: true, orderNumber: true, total: true },
      });
      if (winner) {
        return {
          orderId: winner.id,
          orderNumber: winner.orderNumber,
          alreadyExisted: true,
          total: Number(winner.total),
        };
      }
    }
    if (err instanceof ApiError) throw err;

    // P2028 = the DB transaction was dropped before it committed (cold-start
    // stall or a connection blip). Nothing was persisted, so one retry is
    // safe; the UNIQUE idempotencyKey still guarantees at most one order.
    if ((err as { code?: string })?.code === "P2028" && !params.__txRetry) {
      console.warn("[order] transaction interrupted (P2028) — retrying once");
      return placeOrder({ ...params, __txRetry: true });
    }

    console.error("[order] placeOrder failed:", err);
    throw badRequest("Could not place your order. Please try again.");
  }
}

function formatBdtSafe(n: number): string {
  return `৳${roundMoney(n).toLocaleString("en-US")}`;
}

/** Local status → customer-facing tracking timeline step. */
export const ORDER_STATUS_FLOW = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
] as const;

export type OrderFlowStatus = (typeof ORDER_STATUS_FLOW)[number];

export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: "Order Placed",
  CONFIRMED: "Confirmed",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  OUT_FOR_DELIVERY: "Out for Delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  RETURNED: "Returned",
  FAILED: "Failed",
};

export function statusStepIndex(status: string): number {
  const idx = (ORDER_STATUS_FLOW as readonly string[]).indexOf(status);
  return idx >= 0 ? idx : -1;
}
