/**
 * ============================================================
 * Payment provider architecture
 * ============================================================
 *
 * Only Cash on Delivery is fully implemented (it needs no external
 * service). bKash / Nagad / Card ship as honest placeholders: they are
 * DISABLED until you add real credentials + API documentation — the
 * checkout will never pretend a gateway payment succeeded.
 *
 * When you receive the real gateway docs, implement the marked functions
 * in each provider file. Nothing else in the checkout flow needs changes.
 */

import type { PaymentMethod } from "@prisma/client";

export interface PaymentContext {
  orderId: string;
  orderNumber: string;
  amount: number;
  currency: "BDT";
  customerPhone: string;
  customerName: string;
  returnUrl: string;
}

export interface PaymentInitResult {
  /** Where to send the customer (gateway page), or null for COD. */
  redirectUrl: string | null;
  /** Gateway transaction/session id, if the gateway returned one. */
  transactionId?: string | null;
  /** Provider payload snapshot (sanitized — never secrets). */
  raw?: unknown;
}

export interface PaymentProvider {
  id: PaymentMethod;
  displayName: string;
  /** Whether this method can be offered at checkout right now. */
  isAvailable(): Promise<boolean>;
  /** Start the payment (COD returns instantly). */
  init(ctx: PaymentContext): Promise<PaymentInitResult>;
  /**
   * Verify/complete a payment from a gateway callback or webhook.
   * Return the resulting status; throw on invalid signatures.
   */
  verify?(payload: unknown): Promise<{ status: "PAID" | "FAILED" | "PENDING"; transactionId?: string | null }>;
}
