import { ExternalCommerceError } from "../../external-commerce/errors";
import type { PaymentInitResult, PaymentProvider, PaymentContext } from "../types";

/**
 * ============================================================
 * Card payments (Stripe/PayPal/local acquirer) — PLACEHOLDER
 * ============================================================
 *
 * No provider or endpoint is chosen or invented here. When you know your
 * acquirer, implement init()/verify() with its official SDK/docs and add
 * its credentials to .env (never NEXT_PUBLIC_).
 */
export class CardProvider implements PaymentProvider {
  id = "CARD" as const;
  displayName = "Credit / Debit Card";

  constructor(private enabled: boolean) {}

  async isAvailable(): Promise<boolean> {
    // Flip to true only after implementing init() with real credentials.
    return false;
  }

  async init(_ctx: PaymentContext): Promise<PaymentInitResult> {
    // TODO(real-gateway): implement with your chosen card processor.
    throw new ExternalCommerceError(
      "NOT_CONFIGURED",
      "Card payments are not configured yet. Choose a processor, add credentials to .env, and implement CardProvider.init().",
      { ambiguous: false }
    );
  }
}
