import { getConfig } from "./config";
import type { ExternalCommerceProvider } from "./provider";
import { MockProvider } from "./providers/mock-provider";
import { HttpProvider } from "./providers/http-provider";

/**
 * Provider factory. Singleton per process.
 *
 *   EXTERNAL_COMMERCE_MODE=disabled → DisabledProvider (never called)
 *   EXTERNAL_COMMERCE_MODE=mock     → MockProvider
 *   EXTERNAL_COMMERCE_MODE=live     → HttpProvider (real API adapter)
 */

const disabledProvider: ExternalCommerceProvider = {
  id: "http",
  mode: "disabled",
  isReady: () => false,
  healthCheck: async () => ({
    ok: false,
    mode: "disabled",
    message:
      "External API integration is disabled. Set EXTERNAL_COMMERCE_MODE=mock (demo) or =live (real API) in .env.",
    checkedAt: new Date().toISOString(),
  }),
  createOrder: async () => {
    const { notConfigured } = await import("./errors");
    throw notConfigured("External API integration is disabled (EXTERNAL_COMMERCE_MODE=disabled).");
  },
  lookupOrder: async () => ({ found: false }),
  fetchOrderStatus: async () => ({ found: false, externalOrderId: "" }),
};

let instance: ExternalCommerceProvider | null = null;

export function getExternalProvider(): ExternalCommerceProvider {
  if (instance) return instance;
  const cfg = getConfig();
  if (cfg.mode === "mock") instance = new MockProvider(cfg);
  else if (cfg.mode === "live") instance = new HttpProvider(cfg);
  else instance = disabledProvider;
  return instance;
}

/** Test helper — drop the cached provider (used when env changes). */
export function resetExternalProvider(): void {
  instance = null;
}

export type { ExternalCommerceProvider };
