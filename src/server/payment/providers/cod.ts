import type { PaymentInitResult, PaymentProvider, PaymentContext } from "../types";

/**
 * Cash on Delivery — fully functional, no external service required.
 * Availability is controlled from Admin → Settings → Checkout.
 */
export class CodProvider implements PaymentProvider {
  id = "COD" as const;
  displayName = "Cash on Delivery";

  private enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  async isAvailable(): Promise<boolean> {
    return this.enabled;
  }

  async init(_ctx: PaymentContext): Promise<PaymentInitResult> {
    // Nothing to initiate — the customer pays when the parcel arrives.
    return { redirectUrl: null, transactionId: null, raw: { cod: true } };
  }
}
