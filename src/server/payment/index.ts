import { getSettings } from "../../lib/settings";
import type { PaymentMethod } from "@prisma/client";
import type { PaymentProvider } from "./types";
import { CodProvider } from "./providers/cod";
import { BkashProvider } from "./providers/bkash";
import { NagadProvider } from "./providers/nagad";
import { CardProvider } from "./providers/card";

export type { PaymentProvider, PaymentContext, PaymentInitResult } from "./types";

/**
 * Resolve a payment provider for checkout. Availability is computed from
 * Admin settings + presence of real credentials — methods that need real
 * credentials stay hidden instead of failing late.
 */
export async function getPaymentProvider(method: PaymentMethod): Promise<PaymentProvider> {
  const s = await getSettings();

  switch (method) {
    case "COD":
      return new CodProvider(s.checkout.codEnabled);
    case "BKASH":
      return new BkashProvider(s.checkout.bkashEnabled, {
        appKey: process.env.BKASH_APP_KEY || "",
        appSecret: process.env.BKASH_APP_SECRET || "",
        baseUrl: process.env.BKASH_BASE_URL || "",
      });
    case "NAGAD":
      return new NagadProvider(s.checkout.nagadEnabled, {
        merchantId: process.env.NAGAD_MERCHANT_ID || "",
        privateKey: process.env.NAGAD_PRIVATE_KEY || "",
        publicKey: process.env.NAGAD_PUBLIC_KEY || "",
      });
    case "CARD":
      return new CardProvider(s.checkout.cardEnabled);
    default:
      return new CodProvider(s.checkout.codEnabled);
  }
}

/** Methods currently offered at checkout (client-safe, no secrets). */
export async function availablePaymentMethods(): Promise<
  { method: PaymentMethod; label: string; hint: string }[]
> {
  const s = await getSettings();
  const candidates: PaymentMethod[] = ["COD", "BKASH", "NAGAD", "CARD"];
  const out: { method: PaymentMethod; label: string; hint: string }[] = [];

  for (const m of candidates) {
    const provider = await getPaymentProvider(m);
    if (await provider.isAvailable()) {
      out.push({
        method: m,
        label: provider.displayName,
        hint: m === "COD" ? "Pay cash when your order arrives" : "",
      });
    }
  }
  return out;
}
