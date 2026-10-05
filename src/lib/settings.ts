import { prisma } from "./db";

/**
 * Site settings live in the DB (key → JSON value) so the admin panel can
 * change them without code edits. Cached in-memory briefly to keep the
 * storefront fast; invalidated on every admin write.
 */

export type PaymentMethodKey = "COD" | "BKASH" | "NAGAD" | "CARD";

export interface SettingsShape {
  /** Site identity — the logo shown beside the site name. */
  brand: {
    /** Logo image URL (uploaded via Admin → Settings → Brand). Empty = the
     *  built-in gold monogram is used instead. */
    logo: string;
  };
  announcement: {
    enabled: boolean;
    text: string;
    link: string;
  };
  contact: {
    phone: string;
    email: string;
    address: string;
    hours: string;
    facebook: string;
    instagram: string;
    youtube: string;
  };
  seo: {
    defaultTitle: string;
    titleTemplate: string;
    defaultDescription: string;
    keywords: string;
    ogImage: string;
    robots: string;
  };
  checkout: {
    deliveryChargeDefault: number;
    freeDeliveryMin: number;
    deliveryCharges: Record<string, number>; // district (jela) → charge
    codEnabled: boolean;
    bkashEnabled: boolean;
    nagadEnabled: boolean;
    cardEnabled: boolean;
    instructions: string;
  };
  trust: { title: string; text: string; icon: string }[];
  footer: {
    aboutText: string;
    copyright: string;
  };
  externalApi: {
    // Non-secret display settings only. Secrets stay in .env.
    displayName: string;
    autoSync: boolean;
    notes: string;
  };
  /**
   * Telegram order alerts (Admin → Settings → Telegram).
   * Only the message title and destination chat are stored here — the bot
   * token itself lives in .env (TELEGRAM_BOT_TOKEN) and never enters the DB.
   */
  telegram: {
    /** Header line of every order alert. */
    title: string;
    /** Chat / group / channel id alerts are delivered to. Empty = disabled. */
    chatId: string;
  };
}

export const DEFAULT_SETTINGS: SettingsShape = {
  brand: {
    logo: "",
  },
  announcement: {
    enabled: true,
    text: "Free delivery on orders over ৳3,000 • Cash on Delivery available nationwide",
    link: "/search",
  },
  contact: {
    phone: "+880 1700-000000",
    email: "support@imalissa.com",
    address: "Dhaka, Bangladesh",
    hours: "Sat – Thu, 9:00 AM – 10:00 PM",
    facebook: "https://facebook.com",
    instagram: "https://instagram.com",
    youtube: "https://youtube.com",
  },
  seo: {
    defaultTitle: "Imalissa — Premium Online Shopping in Bangladesh",
    titleTemplate: "%s | Imalissa",
    defaultDescription:
      "Imalissa is a premium multi-category online store in Bangladesh — electronics, gadgets, fashion for men, women & kids, baby products, home & lifestyle. Cash on Delivery available.",
    keywords: "online shopping bangladesh, electronics, fashion, imalissa",
    ogImage: "/images/og-default.jpg",
    robots: "index, follow",
  },
  checkout: {
    // District-level zone rule: Dhaka district →৳80 (deliveryCharges["Dhaka"]),
    // every other district →৳130 (deliveryChargeDefault). Keys are district names.
    deliveryChargeDefault: 130,
    freeDeliveryMin: 3000,
    deliveryCharges: {
      Dhaka: 80,
      Chattogram: 130,
      Rajshahi: 130,
      Khulna: 130,
      Barishal: 130,
      Sylhet: 130,
      Rangpur: 130,
      Mymensingh: 130,
    },
    codEnabled: true,
    bkashEnabled: false,
    nagadEnabled: false,
    cardEnabled: false,
    instructions: "",
  },
  trust: [
    { title: "100% Authentic Products", text: "Sourced from trusted suppliers", icon: "shield" },
    { title: "Cash on Delivery", text: "Pay when you receive your order", icon: "wallet" },
    { title: "Fast Delivery", text: "Within 2–5 days across Bangladesh", icon: "truck" },
    { title: "Easy Returns", text: "7-day hassle-free return policy", icon: "refresh" },
  ],
  footer: {
    aboutText:
      "Imalissa is a premium multi-category online store bringing you authentic electronics, fashion, home and lifestyle products across Bangladesh.",
    copyright: "© {{year}} Imalissa. All rights reserved.",
  },
  externalApi: {
    displayName: "Partner Commerce API",
    autoSync: true,
    notes: "",
  },
  telegram: {
    title: "Imalissa Orders",
    chatId: "",
  },
};

type CacheEntry = { value: SettingsShape; at: number };
let cache: CacheEntry | null = null;
const CACHE_MS = 30_000;

export function invalidateSettingsCache(): void {
  cache = null;
}

function deepMerge<T>(base: T, patch: any): T {
  if (Array.isArray(base) || typeof base !== "object" || base === null) {
    return (patch === undefined ? base : patch) as T;
  }
  const out: any = { ...base };
  for (const key of Object.keys(patch ?? {})) {
    out[key] = deepMerge((base as any)[key], patch[key]);
  }
  return out as T;
}

/** Read all settings merged over defaults (never throws). */
export async function getSettings(): Promise<SettingsShape> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  let stored: Record<string, unknown> = {};
  try {
    const rows = await prisma.siteSetting.findMany();
    for (const row of rows) {
      // OTP rows are transient verification codes (see src/lib/otp.ts) and
      // reset rows are password-reset link hashes (src/lib/password-reset.ts)
      // — they are never settings and must never reach the admin settings API.
      if (row.key.startsWith("otp:") || row.key.startsWith("reset:")) continue;
      stored[row.key] = row.value;
    }
  } catch (err) {
    console.error("[settings] failed to read:", err);
  }

  const merged = deepMerge(DEFAULT_SETTINGS, stored);
  cache = { value: merged, at: Date.now() };
  return merged;
}

/** Read a single top-level settings group. */
export async function getSettingGroup<K extends keyof SettingsShape>(
  group: K
): Promise<SettingsShape[K]> {
  const all = await getSettings();
  return all[group];
}

/** Persist a partial settings patch (admin only). */
export async function updateSettings(
  patches: Partial<Record<keyof SettingsShape, unknown>>
): Promise<SettingsShape> {
  for (const [key, value] of Object.entries(patches)) {
    if (value === undefined) continue;
    await prisma.siteSetting.upsert({
      where: { key },
      update: { value: value as object },
      create: { key, value: value as object, group: key },
    });
  }
  invalidateSettingsCache();
  return getSettings();
}
