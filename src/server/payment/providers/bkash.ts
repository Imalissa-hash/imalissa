import { ExternalCommerceError } from "../../external-commerce/errors";
import type { PaymentInitResult, PaymentProvider, PaymentContext } from "../types";

/**
 * ============================================================
 * bKash payment adapter — PLACEHOLDER (not a fake integration)
 * ============================================================
 *
 * ⚠️  No endpoint, header or field in this file is invented. Until you
 * provide bKash's real credentials + API documentation (and implement the
 * marked functions), `isAvailable()` returns false whenever credentials
 * are missing, and `init()` throws a clear error instead of pretending a
 * payment was created.
 *
 * ── TO ENABLE ─────────────────────────────────────────────────────
 *  1. .env:  BKASH_APP_KEY, BKASH_APP_SECRET, BKASH_BASE_URL
 *  2. Admin → Settings → enable bKash
 *  3. Implement init() + verify() below from bKash's official docs
 *     (Token Generation → Create Payment → Execute Payment → callback
 *      validation). Keep every secret server-side.
 * ──────────────────────────────────────────────────────────────────
 */
export class BkashProvider implements PaymentProvider {
  id = "BKASH" as const;
  displayName = "bKash";

  constructor(
    private enabled: boolean,
    private creds: { appKey: string; appSecret: string; baseUrl: string }
  ) {}

  async isAvailable(): Promise<boolean> {
    return this.enabled && Boolean(this.creds.appKey && this.creds.appSecret && this.creds.baseUrl);
  }

  async init(_ctx: PaymentContext): Promise<PaymentInitResult> {
    // TODO(real-gateway): implement bKash Create Payment per official docs.
    throw new ExternalCommerceError(
      "NOT_CONFIGURED",
      "bKash is not configured yet. Add credentials to .env and implement BkashProvider.init() from the official API documentation.",
      { ambiguous: false }
    );
  }

  async verify(): Promise<{ status: "PAID" | "FAILED" | "PENDING"; transactionId?: string | null }> {
    // TODO(real-gateway): implement Execute Payment + signature validation.
    throw new ExternalCommerceError(
      "NOT_CONFIGURED",
      "bKash verification is not configured yet.",
      { ambiguous: false }
    );
  }
}
