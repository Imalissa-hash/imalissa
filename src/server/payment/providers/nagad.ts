import { ExternalCommerceError } from "../../external-commerce/errors";
import type { PaymentInitResult, PaymentProvider, PaymentContext } from "../types";

/**
 * ============================================================
 * Nagad payment adapter — PLACEHOLDER (not a fake integration)
 * ============================================================
 *
 * No endpoints or fields are invented. Provide Nagad's real merchant
 * credentials + API documentation, then implement init()/verify() below.
 *
 *  .env: NAGAD_MERCHANT_ID, NAGAD_PRIVATE_KEY, NAGAD_PUBLIC_KEY
 */
export class NagadProvider implements PaymentProvider {
  id = "NAGAD" as const;
  displayName = "Nagad";

  constructor(
    private enabled: boolean,
    private creds: { merchantId: string; privateKey: string; publicKey: string }
  ) {}

  async isAvailable(): Promise<boolean> {
    return (
      this.enabled &&
      Boolean(this.creds.merchantId && this.creds.privateKey && this.creds.publicKey)
    );
  }

  async init(_ctx: PaymentContext): Promise<PaymentInitResult> {
    // TODO(real-gateway): implement Nagad payment request per official docs.
    throw new ExternalCommerceError(
      "NOT_CONFIGURED",
      "Nagad is not configured yet. Add credentials to .env and implement NagadProvider.init() from the official API documentation.",
      { ambiguous: false }
    );
  }

  async verify(): Promise<{ status: "PAID" | "FAILED" | "PENDING"; transactionId?: string | null }> {
    // TODO(real-gateway): implement callback signature validation.
    throw new ExternalCommerceError(
      "NOT_CONFIGURED",
      "Nagad verification is not configured yet.",
      { ambiguous: false }
    );
  }
}
