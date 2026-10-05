import { randomUUID } from "crypto";
import { sleep } from "../../../lib/utils";
import { getConfig, type ExternalCommerceConfig } from "../config";
import { ExternalCommerceError } from "../errors";
import type { ExternalCommerceProvider } from "../provider";
import type {
  CallOptions,
  ExternalHealthResult,
  ExternalLookupResult,
  ExternalOrderInput,
  ExternalOrderResult,
  ExternalOrderStatusResult,
} from "../types";

/**
 * ============================================================
 * MOCK provider — NOT a real integration.
 * ============================================================
 *
 * Simulates an external e-commerce API so the whole flow
 *   order placed → forwarded → external ID saved → status pulled
 * can be tested locally without inventing any real endpoints.
 *
 * Every response it produces is tagged `mock: true`, and the admin
 * dashboard displays a permanent "MOCK MODE" banner whenever this
 * provider is active.
 *
 * Simulate failures from the checkout "delivery instructions" field:
 *   - "SIMULATE_TIMEOUT" → ambiguous timeout (response lost after send)
 *   - "SIMULATE_FAIL"    → definite validation error (safe retry)
 *   - "SIMULATE_500"     → HTTP 500 (ambiguous — may have been processed)
 *
 * In-memory store: resets when the server restarts (demo only).
 */

interface MockRecord {
  externalOrderId: string;
  orderNumber: string;
  input: ExternalOrderInput;
  createdAt: number;
}

const store = new Map<string, MockRecord>(); // key: idempotencyKey
const byExternalId = new Map<string, MockRecord>();

function deriveStatus(rec: MockRecord): string {
  const mins = (Date.now() - rec.createdAt) / 60_000;
  if (mins < 2) return "CONFIRMED";
  if (mins < 10) return "PROCESSING";
  if (mins < 25) return "SHIPPED";
  if (mins < 60) return "OUT_FOR_DELIVERY";
  return "DELIVERED";
}

export class MockProvider implements ExternalCommerceProvider {
  readonly id = "mock" as const;
  readonly mode = "mock" as const;

  constructor(private config: ExternalCommerceConfig = getConfig()) {}

  isReady(): boolean {
    return this.config.mode === "mock";
  }

  async healthCheck(): Promise<ExternalHealthResult> {
    const started = Date.now();
    await sleep(120);
    return {
      ok: true,
      mode: "mock",
      message:
        "Mock provider active — orders are simulated, NOT sent to any real system. Configure the real API adapter before going live.",
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
    };
  }

  async createOrder(
    input: ExternalOrderInput,
    options: CallOptions
  ): Promise<ExternalOrderResult> {
    const key = options.idempotencyKey || input.meta.idempotencyKey;

    // Simulated network latency.
    await sleep(500 + Math.floor(Math.random() * 700));

    const hook = `${input.delivery.instructions ?? ""} ${input.delivery.note ?? ""}`.toUpperCase();

    if (hook.includes("SIMULATE_TIMEOUT")) {
      await sleep(1200);
      throw new ExternalCommerceError("TIMEOUT", "Simulated: no response received within timeout", {
        ambiguous: true,
      });
    }
    if (hook.includes("SIMULATE_500")) {
      throw new ExternalCommerceError("SERVER", "Simulated HTTP 500 from external system", {
        ambiguous: true,
        status: 500,
      });
    }
    if (hook.includes("SIMULATE_FAIL")) {
      throw new ExternalCommerceError("VALIDATION", "Simulated HTTP 422: rejected order payload", {
        ambiguous: false,
        status: 422,
        body: { error: "simulated validation failure", orderNumber: input.orderNumber },
      });
    }

    if (!input.items.length) {
      throw new ExternalCommerceError("VALIDATION", "Order has no line items", {
        ambiguous: false,
        status: 400,
      });
    }

    // Idempotency: same key → same external order (never duplicates).
    const existing = store.get(key);
    if (existing) {
      return {
        externalOrderId: existing.externalOrderId,
        raw: { mock: true, idempotentReplay: true, orderNumber: input.orderNumber },
      };
    }

    const externalOrderId = `EXT-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
    const rec: MockRecord = { externalOrderId, orderNumber: input.orderNumber, input, createdAt: Date.now() };
    store.set(key, rec);
    byExternalId.set(externalOrderId, rec);

    return {
      externalOrderId,
      raw: {
        mock: true,
        created: true,
        externalOrderId,
        receivedOrderNumber: input.orderNumber,
        itemCount: input.items.length,
        total: input.totals.grandTotal,
        currency: input.currency,
      },
    };
  }

  async lookupOrder(idempotencyKey: string): Promise<ExternalLookupResult> {
    await sleep(200);
    const rec = store.get(idempotencyKey);
    if (!rec) return { found: false, raw: { mock: true, found: false, idempotencyKey } };
    return {
      found: true,
      externalOrderId: rec.externalOrderId,
      raw: { mock: true, found: true, externalOrderId: rec.externalOrderId },
    };
  }

  async fetchOrderStatus(externalOrderId: string): Promise<ExternalOrderStatusResult> {
    await sleep(200);
    const rec = byExternalId.get(externalOrderId);
    if (!rec) {
      return { found: false, externalOrderId, raw: { mock: true, found: false } };
    }
    const status = deriveStatus(rec);
    return {
      found: true,
      externalOrderId,
      status,
      trackingNumber: `MOCK-TRK-${externalOrderId.slice(-6)}`,
      trackingUrl: null,
      raw: { mock: true, status, externalOrderId },
    };
  }
}
