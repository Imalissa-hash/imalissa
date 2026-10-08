import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, rateLimit, clientIp } from "@/lib/api";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { badRequest } from "@/lib/errors";
import { getSettings, updateSettings } from "@/lib/settings";

/**
 * Site settings API (display-only configuration).
 *
 * PATCH body — ONE shape, documented here (we deliberately do NOT also
 * accept a multi-group `patches` map):
 *
 *     { "group": "contact", "value": { ...fields of that group... } }
 *
 * One group per request keeps zod validation, auditing and cache
 * invalidation precise, and limits the blast radius of a malformed
 * payload to a single settings group.
 *
 * SECURITY — settings are display-only config:
 *  - Any payload KEY matching /key|secret|token|password|credential/i is
 *    rejected with 400 before parsing. Real API credentials live in the
 *    server .env file and are never accepted, stored or returned here.
 *  - The only SettingsShape contract field that incidentally matches the
 *    pattern is the SEO field "keywords" (meta keywords). It is explicitly
 *    allow-listed below; every other credential-looking key is refused.
 *  - GET only ever returns the SettingsShape produced by getSettings(),
 *    which contains no credentials by construction.
 */

/* ── Credential-key guard ─────────────────────────────────────────── */

const FORBIDDEN_KEY = /key|secret|token|password|credential/i;

/**
 * Every field name of the SettingsShape contract. Keys in this set are
 * allowed even if they incidentally match FORBIDDEN_KEY (only "keywords"
 * actually does today) — anything else credential-looking is rejected,
 * including keys nested inside values such as deliveryCharges.
 */
const CONTRACT_FIELDS = new Set<string>([
  // brand
  "logo",
  // announcement
  "enabled", "text", "link",
  // contact
  "phone", "email", "address", "hours", "facebook", "instagram", "youtube",
  // seo
  "defaultTitle", "titleTemplate", "defaultDescription", "keywords", "ogImage", "robots",
  // checkout
  "deliveryChargeDefault", "freeDeliveryMin", "deliveryCharges",
  "codEnabled", "bkashEnabled", "nagadEnabled", "cardEnabled", "instructions",
  // trust rows
  "title", "icon",
  // footer
  "aboutText", "copyright",
  // externalApi
  "displayName", "autoSync", "notes",
]);

function assertNoCredentialKeys(value: unknown, path = "body"): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoCredentialKeys(v, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEY.test(k) && !CONTRACT_FIELDS.has(k)) {
        throw badRequest(
          `Settings are display-only: "${path}.${k}" looks like a credential and is not accepted here. ` +
            "Real API credentials (URL/keys) belong in the server .env file."
        );
      }
      assertNoCredentialKeys(v, `${path}.${k}`);
    }
  }
}

/* ── Zod schemas — loose but typed to the SettingsShape contract ─── */

/** Site identity: the logo image shown beside the site name. */
const brandSchema = z.object({
  logo: z.string().max(300, "Logo path is too long"),
});

const announcementSchema = z.object({
  enabled: z.boolean(),
  text: z.string().max(500, "Keep the announcement under 500 characters"),
  link: z.string().max(300, "Link is too long"),
});

const contactSchema = z.object({
  phone: z.string().max(60),
  email: z.string().max(150),
  address: z.string().max(300),
  hours: z.string().max(200),
  facebook: z.string().max(300),
  instagram: z.string().max(300),
  youtube: z.string().max(300),
});

const seoSchema = z.object({
  defaultTitle: z.string().max(200, "Keep the title under 200 characters"),
  titleTemplate: z.string().max(200),
  defaultDescription: z.string().max(600, "Keep the description under 600 characters"),
  keywords: z.string().max(500),
  ogImage: z.string().max(300),
  robots: z.string().max(100),
});

const checkoutSchema = z.object({
  deliveryChargeDefault: z.number().min(0).max(10000),
  freeDeliveryMin: z.number().min(0).max(1000000),
  deliveryCharges: z.record(z.string().min(1).max(60), z.number().min(0).max(10000)),
  codEnabled: z.boolean(),
  bkashEnabled: z.boolean(),
  nagadEnabled: z.boolean(),
  cardEnabled: z.boolean(),
  instructions: z.string().max(2000),
});

const trustSchema = z
  .array(
    z.object({
      title: z.string().min(1, "Badge title cannot be empty").max(80),
      text: z.string().min(1, "Badge text cannot be empty").max(200),
      icon: z.enum(["shield", "wallet", "truck", "refresh"]),
    })
  )
  .min(1, "Keep at least one trust badge")
  .max(8, "Keep at most 8 trust badges");

const footerSchema = z.object({
  aboutText: z.string().max(1000),
  copyright: z.string().max(200),
});

const externalApiSchema = z.object({
  displayName: z.string().max(120),
  autoSync: z.boolean(),
  notes: z.string().max(1000),
});

/**
 * Telegram order alerts. Note the field names deliberately avoid anything
 * credential-shaped — the bot token stays in .env and is rejected here.
 */
const telegramSchema = z.object({
  title: z.string().max(80, "Keep the title under 80 characters"),
  chatId: z.string().max(60, "Chat ID is too long"),
});

const GROUP_SCHEMAS = {
  brand: brandSchema,
  announcement: announcementSchema,
  contact: contactSchema,
  seo: seoSchema,
  checkout: checkoutSchema,
  trust: trustSchema,
  footer: footerSchema,
  externalApi: externalApiSchema,
  telegram: telegramSchema,
} as const;

const patchSchema = z.object({
  group: z.enum([
    "brand",
    "announcement",
    "contact",
    "seo",
    "checkout",
    "trust",
    "footer",
    "externalApi",
    "telegram",
  ]),
  value: z.unknown(),
});

/* ── Handlers ─────────────────────────────────────────────────────── */

/** GET /api/admin/settings — all settings groups (display-only config). */
export const GET = withApi(async () => {
  await requirePermission("settings.view");
  return jsonOk(await getSettings());
});

/**
 * PATCH /api/admin/settings — update ONE group.
 * Body: { group, value } (shape documented at the top of this file).
 */
export const PATCH = withApi(async (req: NextRequest) => {
  const admin = await requirePermission("settings.manage");
  rateLimit(`admin-settings:${clientIp(req)}`, 30, 60_000);

  const raw = await req.json().catch(() => null);
  if (raw === null || typeof raw !== "object") {
    throw badRequest("Invalid JSON body");
  }

  // Security first: refuse credential-looking keys anywhere in the payload.
  assertNoCredentialKeys(raw);

  const body = parseBody(patchSchema, raw);
  if (body.value === undefined || body.value === null) {
    throw badRequest(`Missing "value" for settings group "${body.group}"`);
  }

  // Loose-but-typed validation against the SettingsShape contract.
  // Explicit `unknown` so the schema union doesn't force one member's output type.
  const value: unknown = parseBody<unknown>(GROUP_SCHEMAS[body.group], body.value);

  await updateSettings({ [body.group]: value });

  await audit({
    adminId: admin.id,
    action: "SETTINGS_UPDATE",
    entityType: "SiteSetting",
    entityId: body.group,
    details: {
      group: body.group,
      keys:
        value && typeof value === "object"
          ? Object.keys(value as object)
          : Array.isArray(value)
            ? `array(${value.length})`
            : [],
    },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk(await getSettings());
});

export const dynamic = "force-dynamic";
