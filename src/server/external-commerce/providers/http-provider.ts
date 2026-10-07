import { getConfig, type ExternalCommerceConfig } from "../config";
import { ExternalCommerceError, notConfigured, notSupported } from "../errors";
import { roundMoney } from "../../../lib/utils";
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
 * REAL adapter — DropSource BD dropship API
 * ============================================================
 *
 * Source: the partner's documented endpoints (see docs/EXTERNAL_API.md).
 *
 *   GET  {base}/me                      — reseller/profile check (documented,
 *                                          but rejects our dropship key — see
 *                                          ENDPOINTS.health below)
 *   GET  {base}/products                — full live catalog (admin catalog
 *                                          import, and the health check)
 *   POST {base}/orders                  — push an order from our checkout
 *   GET  {base}/orders/track?code=…     — order status / tracking pull
 *
 * Auth: `Authorization: Bearer <EXTERNAL_COMMERCE_API_KEY>`
 *       (base URL already includes /api/dropship/v1 — no trailing slash).
 *
 * Everything below is copied from that documentation. Anything the docs do
 * NOT define stays honestly unimplemented:
 *
 *   · lookupOrder() → NOT_SUPPORTED. The partner has no "find order by MY
 *     reference" endpoint, so an ambiguous (timeout) push cannot be proven
 *     safe automatically — the order parks in SYNC_TIMEOUT for manual admin
 *     release/verify. We still write our order number into `note` so the
 *     partner's order list shows which Imalissa order it was.
 */

const ENDPOINTS = {
  /** POST — create an order in the partner system. */
  createOrder: { method: "POST", path: "/orders" } as
    | null
    | { method: "GET" | "POST" | "PUT"; path: string },
  /**
   * GET — lookup by OUR order reference.
   * NOT available in the partner API (track only accepts their code/phone),
   * so this stays null on purpose → verifyAmbiguousOrder() will tell the
   * admin to decide manually instead of guessing.
   */
  lookupOrder: null as null | { method: "GET" | "POST"; path: string },
  /** GET — status of an external order: /orders/track?code={externalOrderId} */
  getOrderStatus: { method: "GET", path: "/orders/track?code={externalOrderId}" } as
    | null
    | { method: "GET"; path: string },
  /**
   * GET — connectivity/credentials check.
   *
   * The partner documents `GET /me` for this, but that endpoint answers
   * 401 "Invalid or inactive API key" to our dropship key while the same key
   * imports the catalog without complaint (measured: /me → 401, /products →
   * 200 with 130 rows). Probing the endpoint we actually depend on reports
   * the truth; a check the key is not allowed to pass would keep warning
   * "credentials rejected" while import works fine.
   */
  health: { method: "GET", path: "/products" } as null | { method: "GET"; path: string },
};

export class HttpProvider implements ExternalCommerceProvider {
  readonly id = "http" as const;
  readonly mode = "live" as const;

  constructor(private config: ExternalCommerceConfig = getConfig()) {}

  isReady(): boolean {
    return Boolean(
      this.config.baseUrl &&
      ENDPOINTS.createOrder &&
      (this.config.apiKey || this.config.apiSecret)
    );
  }

  // ------------------------------------------------------------------
  // Authentication — documented scheme: Authorization: Bearer <api key>
  // ------------------------------------------------------------------
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (this.config.apiKey) headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    return headers;
  }

  private ensureConfigured(action: string): void {
    if (this.config.mode !== "live") {
      throw notConfigured(`External API is not in live mode (mode=${this.config.mode}).`);
    }
    if (!this.config.baseUrl) {
      throw notConfigured(
        "EXTERNAL_COMMERCE_BASE_URL is empty — set the partner base URL (https://dropsourcebd.com/api/dropship/v1) in Admin → Settings → External API."
      );
    }
    if (!this.config.apiKey) {
      throw notConfigured(
        "EXTERNAL_COMMERCE_API_KEY is empty — paste the partner bearer token in Admin → Settings → External API."
      );
    }
    if (ENDPOINTS.createOrder === null && action === "createOrder") {
      throw notConfigured(
        "No endpoint configured for createOrder. Fill ENDPOINTS.createOrder in src/server/external-commerce/providers/http-provider.ts from your API documentation."
      );
    }
  }

  /** Fetch with timeout + error classification (ambiguous vs safe). */
  private async request(
    path: string,
    init: RequestInit,
    opts: { timeoutMs?: number; treatNonOkAsAmbiguous?: boolean } = {}
  ): Promise<Response> {
    const url = `${this.config.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const timeoutMs = opts.timeoutMs ?? this.config.timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });

      if (res.ok) return res;

      const bodyText = await res.text().catch(() => "");
      let body: unknown = bodyText.slice(0, 2000);
      try {
        body = JSON.parse(bodyText);
      } catch {
        /* keep text */
      }

      if (res.status === 401 || res.status === 403) {
        throw new ExternalCommerceError("AUTH", `External API rejected credentials (HTTP ${res.status})`, {
          ambiguous: false,
          status: res.status,
          body,
        });
      }
      if (res.status === 429) {
        throw new ExternalCommerceError("RATE_LIMIT", "External API rate limited us (HTTP 429)", {
          ambiguous: false,
          status: res.status,
          body,
        });
      }
      if (res.status >= 400 && res.status < 500) {
        throw new ExternalCommerceError("VALIDATION", `External API returned HTTP ${res.status}`, {
          ambiguous: false,
          status: res.status,
          body,
        });
      }
      // 5xx — the system may have processed the request before failing.
      throw new ExternalCommerceError("SERVER", `External API server error (HTTP ${res.status})`, {
        ambiguous: true,
        status: res.status,
        body,
      });
    } catch (err) {
      if (err instanceof ExternalCommerceError) throw err;

      const isAbort =
        err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
      if (isAbort) {
        // We sent the request but never saw a response — ambiguous.
        throw new ExternalCommerceError("TIMEOUT", `External API timed out after ${timeoutMs}ms`, {
          ambiguous: true,
          cause: err,
        });
      }
      // Connection failure — we cannot prove the server didn't receive it.
      throw new ExternalCommerceError(
        "NETWORK",
        `Could not reach external API: ${err instanceof Error ? err.message : String(err)}`,
        { ambiguous: true, cause: err }
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async healthCheck(): Promise<ExternalHealthResult> {
    const started = Date.now();
    try {
      this.ensureConfigured("health");
      if (!ENDPOINTS.health) {
        return {
          ok: false,
          mode: "live",
          message:
            "Adapter not fully configured: set ENDPOINTS.health (optional) in http-provider.ts. createOrder " +
            (ENDPOINTS.createOrder ? "IS configured." : "is NOT configured yet."),
          checkedAt: new Date().toISOString(),
        };
      }
      const res = await this.request(
        ENDPOINTS.health.path,
        { method: ENDPOINTS.health.method, headers: this.buildHeaders() },
        { timeoutMs: 8000 }
      );
      let message = res.ok ? "Connected" : `Catalog endpoint returned HTTP ${res.status}`;
      if (res.ok) {
        // GET /products → a JSON array. Only the row count is reported; the
        // key itself and any other credential never leave this function.
        const payload = (await res.json().catch(() => null)) as unknown;
        if (Array.isArray(payload)) {
          message = `Connected — catalog reachable (${payload.length} products)`;
        }
      }
      return {
        ok: res.ok,
        mode: "live",
        message,
        latencyMs: Date.now() - started,
        checkedAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        ok: false,
        mode: "live",
        message: err instanceof Error ? err.message : "Connection check failed",
        latencyMs: Date.now() - started,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  // ------------------------------------------------------------------
  // 3a — Imalissa order → partner request body (documented fields)
  //
  //   POST /orders
  //   { customer_name, customer_phone, customer_address,
  //     items: [{ title, qty, price, productId? }],
  //     delivery_charge?, coupon_code?, note? }
  // ------------------------------------------------------------------
  private mapCreateOrderRequest(input: ExternalOrderInput): Record<string, unknown> {
    if (!input.items.length) {
      throw new ExternalCommerceError("VALIDATION", "Order has no line items to forward", {
        ambiguous: false,
      });
    }

    const customerName = input.customer.name.trim();
    const phone = input.customer.phone.trim();
    if (!customerName || !phone) {
      throw new ExternalCommerceError(
        "VALIDATION",
        "Partner API requires customer_name and customer_phone — the order is missing one of them.",
        { ambiguous: false }
      );
    }

    const address = this.addressLine(input);
    if (!address) {
      throw new ExternalCommerceError(
        "VALIDATION",
        "Partner API requires customer_address — no address was captured on this order.",
        { ambiguous: false }
      );
    }

    const items = input.items.map((line) => {
      const item: Record<string, unknown> = {
        title: line.variantLabel ? `${line.name} (${line.variantLabel})` : line.name,
        qty: Math.max(1, Math.round(line.quantity)),
        // The partner bills us at cost (their `reseller_price`, stored as
        // Product.costPrice) — the storefront's customer price is ours to keep.
        price: roundMoney(line.costPrice ?? line.unitPrice),
      };
      // Their id from GET /products — lets the partner re-check stock.
      if (line.externalRef) item.productId = line.externalRef;
      return item;
    });

    // `note` is the only free-text field, so it carries OUR order number —
    // that is how the push can be found again in the partner's order list.
    const note = [
      `Imalissa ${input.orderNumber}`,
      input.delivery.instructions,
      input.delivery.note,
    ]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 500);

    const body: Record<string, unknown> = {
      customer_name: customerName,
      customer_phone: phone,
      customer_address: address,
      items,
      delivery_charge: roundMoney(input.totals.deliveryCharge),
    };
    if (input.totals.couponCode) body.coupon_code = input.totals.couponCode;
    if (note) body.note = note;
    return body;
  }

  /** Full address line: fullAddress, falling back to area → district → division. */
  private addressLine(input: ExternalOrderInput): string {
    const seen = new Set<string>();
    const parts = [
      input.delivery.address,
      input.delivery.area,
      input.delivery.district,
      input.delivery.division,
    ]
      .map((p) => (p ?? "").trim())
      .filter((p) => {
        if (!p) return false;
        const k = p.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    return parts.join(", ");
  }

  // ------------------------------------------------------------------
  // 3b — partner response → externalOrderId
  //   { success, order_id, order_code, invoice_no, total }
  // order_code (#128) is what GET /orders/track accepts, so it wins.
  // ------------------------------------------------------------------
  private parseCreateOrderResponse(payload: unknown): ExternalOrderResult {
    const body = (payload ?? {}) as {
      success?: boolean;
      error?: string;
      message?: string;
      order_id?: string;
      order_code?: string;
      invoice_no?: string;
    };

    if (body.success === false || body.error) {
      throw new ExternalCommerceError(
        "VALIDATION",
        body.error || body.message || "Partner rejected the order",
        { ambiguous: false, body: payload }
      );
    }

    const externalOrderId = body.order_code || body.invoice_no || body.order_id;
    if (!externalOrderId) {
      throw new ExternalCommerceError(
        "VALIDATION",
        "Partner response did not include an order code/order id",
        { ambiguous: false, body: payload }
      );
    }
    return { externalOrderId: String(externalOrderId), raw: payload };
  }

  // ------------------------------------------------------------------
  // 3c — GET /orders/track response → our status shape
  //   { orders: [ { id, status, total, date, items… } ] }
  // The status text comes back free-form/localized ("পেন্ডিং"…); sync-order
  // maps what it recognises and leaves our status untouched otherwise.
  // ------------------------------------------------------------------
  private parseStatusResponse(
    externalOrderId: string,
    payload: unknown
  ): ExternalOrderStatusResult {
    const body = (payload ?? {}) as {
      orders?: Array<{ id?: string; status?: string }>;
    };
    const orders = Array.isArray(body.orders) ? body.orders : [];
    if (!orders.length) return { found: false, externalOrderId, raw: payload };

    const want = String(externalOrderId).replace(/^#/, "").trim();
    const match =
      orders.find((o) => String(o.id ?? "").replace(/^#/, "").trim() === want) ?? orders[0];

    return {
      found: true,
      externalOrderId,
      status: match?.status ?? null,
      // Their docs expose no tracking fields yet — never invent one.
      trackingNumber: null,
      trackingUrl: null,
      raw: payload,
    };
  }

  async createOrder(
    input: ExternalOrderInput,
    options: CallOptions
  ): Promise<ExternalOrderResult> {
    this.ensureConfigured("createOrder");
    const endpoint = ENDPOINTS.createOrder!;
    const body = this.mapCreateOrderRequest(input);

    const res = await this.request(
      endpoint.path,
      {
        method: endpoint.method,
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
      },
      { timeoutMs: options.timeoutMs }
    );

    const payload = await res.json().catch(() => ({}));
    return this.parseCreateOrderResponse(payload);
  }

  async lookupOrder(idempotencyKey: string, options: CallOptions = {}): Promise<ExternalLookupResult> {
    if (!ENDPOINTS.lookupOrder) {
      throw notSupported(
        `DropSource's API has no "find order by my reference" endpoint (asked for "${idempotencyKey}"). ` +
          "An ambiguous push therefore cannot be verified automatically — confirm it in the partner's " +
          "order list, then use Mark-as-synced or Release-retry in Sync Center."
      );
    }
    const endpoint = ENDPOINTS.lookupOrder;
    const path = endpoint.path.replace("{idempotencyKey}", encodeURIComponent(idempotencyKey));

    const res = await this.request(
      path,
      { method: endpoint.method, headers: this.buildHeaders() },
      { timeoutMs: options.timeoutMs ?? 8000 }
    );
    if (res.status === 404) return { found: false };

    const payload = await res.json().catch(() => ({}));
    // TODO(real-api): adjust to documented response shape.
    const id = (payload as { data?: { id?: string }; id?: string })?.data?.id ??
      (payload as { id?: string })?.id;
    if (id) return { found: true, externalOrderId: String(id), raw: payload };
    return { found: false, raw: payload };
  }

  async fetchOrderStatus(
    externalOrderId: string,
    options: CallOptions = {}
  ): Promise<ExternalOrderStatusResult> {
    if (!ENDPOINTS.getOrderStatus) {
      throw notSupported(
        "Status endpoint is not configured — implement ENDPOINTS.getOrderStatus in http-provider.ts from your API documentation."
      );
    }
    this.ensureConfigured("status");
    // Track accepts "128" or "#128" — send it un-hashed so the URL never
    // carries an encoded "#" fragment marker.
    const code = String(externalOrderId).replace(/^#/, "").trim();
    const path = ENDPOINTS.getOrderStatus.path.replace(
      "{externalOrderId}",
      encodeURIComponent(code)
    );
    const res = await this.request(
      path,
      { method: ENDPOINTS.getOrderStatus.method, headers: this.buildHeaders() },
      { timeoutMs: options.timeoutMs ?? 8000 }
    );
    if (res.status === 404) {
      return { found: false, externalOrderId, raw: { found: false } };
    }
    const payload = await res.json().catch(() => ({}));
    return this.parseStatusResponse(externalOrderId, payload);
  }
}
