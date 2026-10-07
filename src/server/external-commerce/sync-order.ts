import { prisma } from "../../lib/db";
import { getSettings } from "../../lib/settings";
import { ExternalCommerceError, statusForError } from "./errors";
import { getExternalProvider } from "./index";
import { sanitize } from "./config";
import type { ExternalOrderInput } from "./types";
import { roundMoney } from "../../lib/utils";

/**
 * ============================================================
 * Idempotent order synchronization engine
 * ============================================================
 *
 * Guarantees:
 *
 *  1. ONE order per checkout    — Order.idempotencyKey is UNIQUE; a double
 *                                 click / refresh / slow network returns the
 *                                 already-created order instead of a new one.
 *
 *  2. ONE push at a time        — a row-level claim (updateMany guarded by
 *                                 syncStatus) acts as a lock; a second
 *                                 concurrent retry sees count=0 and exits.
 *
 *  3. No duplicate external orders on timeout — outcomes are classified:
 *       definite failure (4xx)   → FAILED        → retry is safe
 *       ambiguous (timeout/5xx)  → SYNC_TIMEOUT  → must verify via
 *                                  lookupOrder() or manual admin action
 *                                  BEFORE any retry.
 *
 *  4. Full audit trail          — every attempt writes an ApiSyncLog row
 *                                  (sanitized request/response, duration,
 *                                  error) — secrets are never stored.
 *
 *  5. Honest status             — a failed push is NEVER reported as
 *                                 synchronized anywhere in the product.
 */

export type SyncTrigger = "checkout" | "manual" | "auto";

export interface SyncOutcome {
  status: "SYNCED" | "FAILED" | "SYNC_TIMEOUT" | "NOT_CONFIGURED" | "SKIPPED";
  message: string;
  externalOrderId?: string;
  attempt: number;
}

async function buildOrderInput(orderId: string): Promise<{
  input: ExternalOrderInput;
  attempt: number;
} | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { product: { select: { costPrice: true } } } } },
  });
  if (!order) return null;

  const address = order.address as {
    division?: string;
    district?: string;
    area?: string;
    fullAddress?: string;
    instructions?: string;
  };

  const attempt = order.syncAttempts + 1;

  const input: ExternalOrderInput = {
    orderNumber: order.orderNumber,
    placedAt: order.placedAt.toISOString(),
    currency: "BDT",
    customer: {
      name: order.customerName,
      phone: order.customerPhone,
      email: order.customerEmail,
    },
    delivery: {
      division: address?.division ?? "",
      district: address?.district ?? "",
      area: address?.area ?? "",
      address: address?.fullAddress ?? "",
      instructions: address?.instructions ?? null,
      note: order.customerNote ?? null,
    },
    payment: {
      method: order.paymentMethod,
      collectAmount: order.paymentMethod === "COD" ? Number(order.total) : 0,
      isCod: order.paymentMethod === "COD",
    },
    items: order.items.map((item) => ({
      lineId: item.id,
      sku: item.sku,
      name: item.productName,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.lineTotal),
      costPrice:
        item.product?.costPrice != null ? Number(item.product.costPrice) : null,
      variantLabel: item.variantLabel,
      externalRef: item.externalProductRef,
    })),
    totals: {
      subtotal: Number(order.subtotal),
      discount: Number(order.discount),
      couponCode: order.couponCode,
      deliveryCharge: Number(order.deliveryCharge),
      grandTotal: Number(order.total),
    },
    meta: {
      source: "imalissa",
      attempt,
      idempotencyKey: order.orderNumber,
    },
  };

  return { input, attempt };
}

/**
 * Atomically claim the order for synchronization.
 * Returns false when another process/attempt already holds the claim or the
 * order is already synced / not in a retryable state.
 */
async function claimOrder(orderId: string): Promise<boolean> {
  const res = await prisma.order.updateMany({
    where: {
      id: orderId,
      // NOT_CONFIGURED included: orders parked there by the "forwarding
      // off" switch must stay claimable by an explicit Push to API.
      externalSyncStatus: { in: ["PENDING", "FAILED", "NOT_CONFIGURED"] },
      externalOrderId: null,
    },
    data: {
      externalSyncStatus: "SYNCING",
      syncAttempts: { increment: 1 },
      syncStartedAt: new Date(),
    },
  });
  return res.count === 1;
}

async function finalizeSynced(
  orderId: string,
  externalOrderId: string,
  attempt: number,
  requestSnapshot: unknown,
  responseSnapshot: unknown,
  durationMs: number
): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return;

  await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: {
        externalSyncStatus: "SYNCED",
        externalOrderId,
        syncedAt: new Date(),
        lastSyncError: null,
        // Preserve the highest attempt count achieved.
        syncAttempts: Math.max(order.syncAttempts, attempt),
        status: order.status === "PENDING" ? "CONFIRMED" : order.status,
        confirmedAt: order.confirmedAt ?? new Date(),
      },
    }),
    prisma.externalOrderMapping.upsert({
      where: { orderId },
      update: {
        externalOrderId,
        requestSnapshot: sanitize(requestSnapshot) as object,
        responseSnapshot: sanitize(responseSnapshot) as object,
        syncedAt: new Date(),
      },
      create: {
        orderId,
        externalOrderId,
        requestSnapshot: sanitize(requestSnapshot) as object,
        responseSnapshot: sanitize(responseSnapshot) as object,
      },
    }),
    prisma.apiSyncLog.create({
      data: {
        orderId,
        direction: "ORDER_PUSH",
        status: "SUCCESS",
        attempt,
        request: sanitize(requestSnapshot) as object,
        response: sanitize(responseSnapshot) as object,
        durationMs,
      },
    }),
    prisma.notification.create({
      data: {
        orderId,
        userId: order.userId,
        type: "ORDER",
        title: `Order ${order.orderNumber} confirmed`,
        body: "Your order has been forwarded to our fulfillment partner.",
        link: `/account/orders/${order.orderNumber}`,
      },
    }),
  ]);
}

async function finalizeFailure(
  orderId: string,
  status: "FAILED" | "SYNC_TIMEOUT" | "NOT_CONFIGURED",
  attempt: number,
  message: string,
  requestSnapshot: unknown,
  responseSnapshot: unknown | null,
  durationMs: number
): Promise<void> {
  await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: {
        externalSyncStatus: status,
        lastSyncError: message.slice(0, 1000),
        syncStartedAt: null,
      },
    }),
    prisma.apiSyncLog.create({
      data: {
        orderId,
        direction: "ORDER_PUSH",
        status:
          status === "SYNC_TIMEOUT" ? "TIMEOUT" : status === "NOT_CONFIGURED" ? "NOT_CONFIGURED" : "FAILED",
        attempt,
        request: sanitize(requestSnapshot) as object,
        ...(responseSnapshot ? { response: sanitize(responseSnapshot) as object } : {}),
        error: message.slice(0, 1000),
        durationMs,
      },
    }),
  ]);
}

/**
 * Push an order to the external system. Safe to call multiple times —
 * concurrency is serialized by the claim, and duplicates are prevented by
 * idempotency classification.
 */
export async function syncOrder(orderId: string, trigger: SyncTrigger = "auto"): Promise<SyncOutcome> {
  const provider = getExternalProvider();

  const current = await prisma.order.findUnique({ where: { id: orderId } });
  if (!current) {
    return { status: "FAILED", message: "Order not found", attempt: 0 };
  }

  if (current.externalSyncStatus === "SYNCED" && current.externalOrderId) {
    return {
      status: "SKIPPED",
      message: "Already synchronized",
      externalOrderId: current.externalOrderId,
      attempt: current.syncAttempts,
    };
  }

  // ── Order forwarding master switch (Admin → Settings → External API) ──
  // Off means NO order leaves this system automatically — the post-checkout
  // push and any scheduled push are blocked here, before anything is
  // claimed or sent, so not a single request reaches the partner on its
  // own. Catalog / product import does not come through this function and
  // is unaffected.
  //
  // trigger === "manual" is the one deliberate exception: an admin pressing
  // "Push to API" on the order page is an explicit per-order opt-in — that
  // single order IS meant to leave. If the connection (URL/key) is missing
  // the provider below fails honestly with NOT_CONFIGURED instead of
  // guessing; nothing is ever pushed to an unconfigured endpoint.
  const settings = await getSettings();
  if (!settings.externalApi.autoSync && trigger !== "manual") {
    const message =
      "Automatic order forwarding to the external API is turned off — the order stays in Imalissa and is handled by our team. To send one order anyway, use Push to API on its order page. Product import is unaffected.";
    // Leave no row claiming a push is still queued for delivery.
    if (current.externalSyncStatus === "PENDING") {
      await prisma.order
        .updateMany({
          where: { id: orderId, externalSyncStatus: "PENDING" },
          data: { externalSyncStatus: "NOT_CONFIGURED", lastSyncError: message },
        })
        .catch(() => undefined);
    }
    return { status: "NOT_CONFIGURED", message, attempt: current.syncAttempts };
  }

  if (current.externalSyncStatus === "SYNC_TIMEOUT") {
    return {
      status: "SYNC_TIMEOUT",
      message:
        "Previous attempt timed out — verify with the external system before retrying (to avoid duplicates).",
      attempt: current.syncAttempts,
    };
  }

  if (current.externalSyncStatus === "NOT_CONFIGURED" && provider.mode === "disabled") {
    return {
      status: "NOT_CONFIGURED",
      message: "External API is disabled (EXTERNAL_COMMERCE_MODE=disabled).",
      attempt: current.syncAttempts,
    };
  }

  const claimed = await claimOrder(orderId);
  if (!claimed) {
    return {
      status: "SKIPPED",
      message: "Sync already in progress or not in a retryable state.",
      attempt: current.syncAttempts,
    };
  }

  const built = await buildOrderInput(orderId);
  if (!built) {
    return { status: "FAILED", message: "Order disappeared during sync", attempt: 0 };
  }
  const { input, attempt } = built;
  const started = Date.now();

  try {
    const result = await provider.createOrder(input, {
      idempotencyKey: input.meta.idempotencyKey,
    });

    await finalizeSynced(
      orderId,
      result.externalOrderId,
      attempt,
      input,
      result.raw,
      Date.now() - started
    );

    return {
      status: "SYNCED",
      message: trigger === "checkout" ? "Forwarded to fulfillment partner" : "Synchronized",
      externalOrderId: result.externalOrderId,
      attempt,
    };
  } catch (err) {
    const durationMs = Date.now() - started;

    if (err instanceof ExternalCommerceError) {
      const mapped = statusForError(err);
      const message = `[${err.code}] ${err.message}`;
      await finalizeSyncedOrNot(orderId, mapped, attempt, message, input, err.body ?? null, durationMs);
      return { status: mapped, message, attempt };
    }

    const message = err instanceof Error ? err.message : String(err);
    await finalizeSyncedOrNot(orderId, "FAILED", attempt, message, input, null, durationMs);
    return { status: "FAILED", message, attempt };
  }
}

async function finalizeSyncedOrNot(
  orderId: string,
  status: "FAILED" | "SYNC_TIMEOUT" | "NOT_CONFIGURED",
  attempt: number,
  message: string,
  input: ExternalOrderInput,
  response: unknown,
  durationMs: number
): Promise<void> {
  await finalizeFailure(orderId, status, attempt, message, input, response, durationMs);
}

/**
 * Resolve an ambiguous (SYNC_TIMEOUT) order by asking the external system
 * whether it already knows our idempotency key.
 *
 *  - found     → mark SYNCED with the external ID (retry would have duplicated)
 *  - not found → mark FAILED (now safe to retry)
 *  - lookup unsupported → throws, admin must decide manually
 */
export async function verifyAmbiguousOrder(
  orderId: string
): Promise<{ found: boolean; externalOrderId?: string }> {
  const provider = getExternalProvider();
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Order not found");
  if (order.externalSyncStatus !== "SYNC_TIMEOUT") {
    throw new Error("Order is not in SYNC_TIMEOUT state");
  }

  const lookup = await provider.lookupOrder(order.orderNumber, {
    idempotencyKey: order.orderNumber,
  });

  if (lookup.found && lookup.externalOrderId) {
    await prisma.$transaction([
      prisma.order.update({
        where: { id: orderId },
        data: {
          externalSyncStatus: "SYNCED",
          externalOrderId: lookup.externalOrderId,
          syncedAt: new Date(),
          lastSyncError: null,
        },
      }),
      prisma.externalOrderMapping.upsert({
        where: { orderId },
        update: { externalOrderId: lookup.externalOrderId, syncedAt: new Date() },
        create: {
          orderId,
          externalOrderId: lookup.externalOrderId,
          responseSnapshot: sanitize(lookup.raw) as object,
        },
      }),
      prisma.apiSyncLog.create({
        data: {
          orderId,
          direction: "VERIFY_IDEMPOTENCY",
          status: "SUCCESS",
          attempt: order.syncAttempts,
          response: sanitize(lookup.raw) as object,
          error: "Ambiguous attempt verified: order exists externally",
        },
      }),
    ]);
    return { found: true, externalOrderId: lookup.externalOrderId };
  }

  // Confirmed NOT created externally → safe to retry.
  await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: { externalSyncStatus: "FAILED", lastSyncError: "Verified not created externally — safe to retry" },
    }),
    prisma.apiSyncLog.create({
      data: {
        orderId,
        direction: "VERIFY_IDEMPOTENCY",
        status: "SUCCESS",
        attempt: order.syncAttempts,
        response: sanitize(lookup.raw) as object,
        error: "Ambiguous attempt verified: order does NOT exist externally — retry unlocked",
      },
    }),
  ]);
  return { found: false };
}

/**
 * Admin override: the order DOES exist externally (confirmed out-of-band)
 * but lookup is unavailable. Stores the manually supplied external ID.
 */
export async function manualMarkSynced(orderId: string, externalOrderId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Order not found");
  if (order.externalSyncStatus === "SYNCED") throw new Error("Already synced");

  await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: {
        externalSyncStatus: "SYNCED",
        externalOrderId,
        syncedAt: new Date(),
        lastSyncError: null,
        status: order.status === "PENDING" ? "CONFIRMED" : order.status,
      },
    }),
    prisma.externalOrderMapping.upsert({
      where: { orderId },
      update: { externalOrderId, syncedAt: new Date() },
      create: { orderId, externalOrderId },
    }),
    prisma.apiSyncLog.create({
      data: {
        orderId,
        direction: "VERIFY_IDEMPOTENCY",
        status: "SKIPPED",
        attempt: order.syncAttempts,
        error: `Manually marked as synced with external ID: ${externalOrderId}`,
      },
    }),
  ]);
}

/**
 * Admin override: confirmed the order does NOT exist externally → unlock retry.
 */
export async function manualReleaseRetry(orderId: string, adminId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Order not found");
  if (order.externalSyncStatus !== "SYNC_TIMEOUT") {
    throw new Error("Order is not in SYNC_TIMEOUT state");
  }

  await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: { externalSyncStatus: "FAILED", lastSyncError: "Manually verified as not created — retry unlocked" },
    }),
    prisma.apiSyncLog.create({
      data: {
        orderId,
        direction: "VERIFY_IDEMPOTENCY",
        status: "SKIPPED",
        attempt: order.syncAttempts,
        error: `Admin ${adminId} confirmed order was NOT created externally — retry unlocked`,
      },
    }),
  ]);
}

/** Pull external status/tracking into our order (when API supports it). */
export async function pullOrderStatus(orderId: string): Promise<{ ok: boolean; message: string }> {
  const provider = getExternalProvider();
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, message: "Order not found" };
  if (!order.externalOrderId) return { ok: false, message: "No external order ID yet" };

  const started = Date.now();
  try {
    const result = await provider.fetchOrderStatus(order.externalOrderId, {
      idempotencyKey: order.orderNumber,
    });

    if (!result.found) {
      await prisma.apiSyncLog.create({
        data: {
          orderId,
          direction: "STATUS_PULL",
          status: "FAILED",
          attempt: order.syncAttempts,
          error: "External order not found when pulling status",
          durationMs: Date.now() - started,
        },
      });
      return { ok: false, message: "External order not found" };
    }

    const mapped = mapExternalStatusToLocal(result.status);

    await prisma.$transaction([
      prisma.order.update({
        where: { id: orderId },
        data: {
          status: mapped ?? order.status,
          trackingNumber: result.trackingNumber ?? order.trackingNumber,
          trackingUrl: result.trackingUrl ?? order.trackingUrl,
          trackingData: sanitize(result.raw) as object,
          shippedAt:
            mapped === "SHIPPED" || mapped === "OUT_FOR_DELIVERY" || mapped === "DELIVERED"
              ? (order.shippedAt ?? new Date())
              : order.shippedAt,
          deliveredAt: mapped === "DELIVERED" ? (order.deliveredAt ?? new Date()) : order.deliveredAt,
        },
      }),
      prisma.apiSyncLog.create({
        data: {
          orderId,
          direction: "STATUS_PULL",
          status: "SUCCESS",
          attempt: order.syncAttempts,
          response: sanitize(result.raw) as object,
          durationMs: Date.now() - started,
          error: `External status: ${result.status ?? "unknown"} → local: ${mapped ?? "unchanged"}`,
        },
      }),
    ]);

    return { ok: true, message: `Status updated to ${mapped ?? "unchanged"}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.apiSyncLog.create({
      data: {
        orderId,
        direction: "STATUS_PULL",
        status: "FAILED",
        attempt: order.syncAttempts,
        error: message.slice(0, 1000),
        durationMs: Date.now() - started,
      },
    });
    return { ok: false, message };
  }
}

/**
 * Map a free-form external status string to our OrderStatus.
 * Deliberately conservative: unknown values leave our status unchanged.
 * Adjust the mapping table when the real API's status vocabulary is known.
 */
const STATUS_MAP: Record<string, "CONFIRMED" | "PROCESSING" | "SHIPPED" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED"> = {
  CONFIRMED: "CONFIRMED",
  ACCEPTED: "CONFIRMED",
  PROCESSING: "PROCESSING",
  PACKED: "PROCESSING",
  SHIPPED: "SHIPPED",
  IN_TRANSIT: "SHIPPED",
  DISPATCHED: "SHIPPED",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  DELIVERED: "DELIVERED",
  COMPLETED: "DELIVERED",
  CANCELLED: "CANCELLED",
  CANCELED: "CANCELLED",
  // DropSource returns localized status text (e.g. "পেন্ডিং").
  // Anything not listed here — including pending — leaves our status as-is.
  কনফার্মড: "CONFIRMED",
  অর্ডার_কনফার্মড: "CONFIRMED",
  প্রসেসিং: "PROCESSING",
  প্যাকিং: "PROCESSING",
  শিপড: "SHIPPED",
  ডেলিভারি_শুরু: "OUT_FOR_DELIVERY",
  "আউট_ফর_ডেলিভারি": "OUT_FOR_DELIVERY",
  ডেলিভারড: "DELIVERED",
  সম্পন্ন: "DELIVERED",
  বাতিল: "CANCELLED",
  ক্যানসেলড: "CANCELLED",
};

export function mapExternalStatusToLocal(
  externalStatus?: string | null
): "CONFIRMED" | "PROCESSING" | "SHIPPED" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED" | null {
  if (!externalStatus) return null;
  // Normalise case and collapse whitespace so "Out for delivery" and
  // "আউট ফর ডেলিভারি" both hit the same key. Unknown text → null (no change).
  const key = externalStatus.trim().replace(/\s+/g, "_").toUpperCase();
  return STATUS_MAP[key] ?? null;
}

/**
 * Convenience used by checkout: initial push.
 *
 * The forwarding switch is evaluated inside syncOrder() so checkout and the
 * manual retry obey exactly one rule; a blocked push reports NOT_CONFIGURED
 * with the reason instead of pretending the order went out.
 */
export async function syncNewOrder(orderId: string): Promise<SyncOutcome> {
  return syncOrder(orderId, "checkout");
}
