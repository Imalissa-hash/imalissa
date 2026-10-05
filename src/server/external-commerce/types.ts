/**
 * ============================================================
 * External Commerce — shared types
 * ============================================================
 *
 * These types are deliberately NEUTRAL. They describe *our* order data
 * (Imalissa's shape), NOT your boss's API fields.
 *
 * When you provide the real API documentation, the field mapping happens
 * in exactly one place:
 *    src/server/external-commerce/providers/http-provider.ts
 * (see mapCreateOrderRequest / parseCreateOrderResponse).
 *
 * Do NOT add guessed endpoint paths or guessed request/response fields
 * anywhere else in the codebase.
 */

export type ExternalMode = "disabled" | "mock" | "live";

/** One Imalissa order, normalized, ready to be mapped to the external API. */
export interface ExternalOrderInput {
  /** Our order number, e.g. IMAL-2026-000001 — stable forever. */
  orderNumber: string;
  placedAt: string; // ISO-8601
  currency: "BDT";

  customer: {
    name: string;
    phone: string;
    email?: string | null;
  };

  delivery: {
    division: string;
    district: string;
    area: string;
    address: string;
    instructions?: string | null;
    /** Customer's note at checkout (also used by mock for test scenarios). */
    note?: string | null;
  };

  payment: {
    /** Our method code: COD | BKASH | NAGAD | CARD | OTHER */
    method: string;
    /** Amount to collect on delivery (0 for prepaid). */
    collectAmount: number;
    isCod: boolean;
  };

  items: ExternalOrderLine[];

  totals: {
    subtotal: number;
    discount: number;
    couponCode?: string | null;
    deliveryCharge: number;
    grandTotal: number;
  };

  meta: {
    source: "imalissa";
    /** Current attempt number (1 for the first push). */
    attempt: number;
    /**
     * IDEMPOTENCY KEY — the stable, unique value the external system can
     * use to deduplicate if your API supports idempotency. We always send
     * the Imalissa order number here.
     */
    idempotencyKey: string;
  };
}

export interface ExternalOrderLine {
  /** Stable line identifier (order item id). */
  lineId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  /**
   * What WE pay the partner for this line (Product.costPrice = their
   * `reseller_price`). The partner is billed at cost, so the storefront's
   * customer price never leaks into the dropship order.
   */
  costPrice?: number | null;
  variantLabel?: string | null;
  /**
   * Pre-mapped external product reference, when an
   * ExternalProductMapping row exists for this product.
   */
  externalRef?: string | null;
}

export interface ExternalOrderResult {
  /** The external system's order ID — stored on our Order row. */
  externalOrderId: string;
  /** Sanitized raw response for the audit trail (secrets stripped). */
  raw: unknown;
}

export interface ExternalLookupResult {
  found: boolean;
  externalOrderId?: string;
  raw?: unknown;
}

/** Status pulled from the external system (when supported). */
export interface ExternalOrderStatusResult {
  found: boolean;
  externalOrderId: string;
  /** Free-form status text from the external system (unmapped). */
  status?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  raw?: unknown;
}

export interface ExternalHealthResult {
  ok: boolean;
  mode: ExternalMode;
  message: string;
  latencyMs?: number;
  checkedAt: string;
}

export interface CallOptions {
  /** Stable idempotency key for this logical operation. */
  idempotencyKey?: string;
  /** Per-call timeout override (ms). */
  timeoutMs?: number;
}
