import type {
  CallOptions,
  ExternalHealthResult,
  ExternalLookupResult,
  ExternalMode,
  ExternalOrderInput,
  ExternalOrderResult,
  ExternalOrderStatusResult,
} from "./types";

/**
 * The contract every external-commerce provider implements.
 *
 * Two providers ship with the project:
 *
 *  1. MockProvider  (mode: "mock")  — simulates an external API so you can
 *     exercise the full order-forwarding flow locally. It clearly reports
 *     itself as a mock everywhere in the admin dashboard.
 *
 *  2. HttpProvider   (mode: "live")  — the real adapter. Its endpoints and
 *     field mappings are intentionally left empty until you paste your
 *     boss's API documentation into providers/http-provider.ts. Calling it
 *     before that throws NOT_CONFIGURED — it will never guess.
 */
export interface ExternalCommerceProvider {
  readonly id: "mock" | "http";
  readonly mode: ExternalMode;

  /** Can we push orders right now? (false → orders stay NOT_CONFIGURED) */
  isReady(): boolean;

  /** Lightweight connectivity/credentials check for the admin dashboard. */
  healthCheck(): Promise<ExternalHealthResult>;

  /**
   * Create the order in the external system.
   * MUST be idempotent per `options.idempotencyKey` when the external API
   * supports idempotency (the key we pass is the Imalissa order number).
   * Throws ExternalCommerceError on failure (see errors.ts).
   */
  createOrder(
    input: ExternalOrderInput,
    options: CallOptions
  ): Promise<ExternalOrderResult>;

  /**
   * Check whether an order identified by idempotencyKey already exists in
   * the external system. Used to resolve SYNC_TIMEOUT (ambiguous) states
   * safely BEFORE any retry, so a duplicate can never be created.
   */
  lookupOrder(idempotencyKey: string, options?: CallOptions): Promise<ExternalLookupResult>;

  /**
   * Pull current status/tracking for an external order (placeholder until
   * the real API docs are provided).
   */
  fetchOrderStatus(
    externalOrderId: string,
    options?: CallOptions
  ): Promise<ExternalOrderStatusResult>;
}
