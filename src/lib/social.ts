import { createHmac, timingSafeEqual } from "crypto";

/**
 * ============================================================
 * Facebook Page messaging — server-side plumbing
 * ============================================================
 *
 * What each credential is FOR, and where it lives:
 *
 *   META_VERIFY_TOKEN   invented by us, stored in SiteSetting (rotatable
 *                       from Admin → Settings → Social). Meta echoes it
 *                       back while registering the webhook so we can prove
 *                       the endpoint is really ours.
 *   META_APP_SECRET     .env only. Meta signs every webhook POST with
 *                       HMAC-SHA256 of the raw body; we recompute it and
 *                       compare. This is what stops anyone else from
 *                       writing rows into the inbox.
 *   META_PAGE_TOKEN     .env only. Lets us call the Graph API to send a
 *                       reply. Inbound messages never need it — a webhook
 *                       works with no token at all, which is why an
 *                       unconfigured install can still RECEIVE mail once
 *                       the app secret is set.
 *
 * Nothing here logs a token, and none of these values are ever returned to
 * a browser. `socialConfigured()` is the single source of truth the admin
 * UI reads to decide between "Not connected" and a live inbox.
 */

/** Environment variable names, in one place so the .env docs stay honest. */
export const SOCIAL_ENV = {
  appSecret: "META_APP_SECRET",
  pageToken: "META_PAGE_TOKEN",
} as const;

const readEnv = (name: string): string => {
  // Never trim an empty string into a truthy value — "" means "unset".
  const v = process.env[name];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : "";
};

/**
 * Does this install have what it needs to VERIFY a webhook signature?
 * True only when Meta's app secret is present. Without it we can still
 * receive a POST, but we cannot prove it came from Meta — so we refuse
 * it rather than trust an unauthenticated writer.
 */
export function canVerifySignature(): boolean {
  return readEnv(SOCIAL_ENV.appSecret) !== "";
}

/** Can we SEND a reply through the Graph API? */
export function canSendReplies(): boolean {
  return readEnv(SOCIAL_ENV.pageToken) !== "";
}

/**
 * Full connection state, for the admin screen. Returns what is present so
 * the UI can tell the user exactly which .env line is missing instead of a
 * useless generic "not connected".
 */
export function socialConfigured(): {
  canVerify: boolean;
  canSend: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  if (!canVerifySignature()) missing.push(SOCIAL_ENV.appSecret);
  if (!canSendReplies()) missing.push(SOCIAL_ENV.pageToken);
  return {
    canVerify: canVerifySignature(),
    canSend: canSendReplies(),
    missing,
  };
}

/**
 * Constant-time compare for the verify token.
 *
 * Meta sends it in the clear on the verification GET. Length is compared
 * first because timingSafeEqual throws on a length mismatch, and the
 * throw path itself would leak length — so we normalise to equal width.
 */
export function verifyTokenMatches(expected: string, got: string | null): boolean {
  if (!expected || !got) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(got, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Validate Meta's `X-Hub-Signature-256` header against the RAW request body.
 *
 * The body must be the untouched bytes: re-serialising parsed JSON would
 * change the whitespace and the digest would never match. Hence `rawBody`
 * rather than an already-parsed object.
 *
 * Returns false — never throws — for a missing header, a malformed header,
 * or a missing app secret, so callers can treat "false" as "reject".
 */
export function isValidSignature(
  rawBody: string | Buffer,
  header: string | null,
  appSecret: string
): boolean {
  if (!appSecret || !header) return false;

  const prefix = "sha256=";
  if (!header.startsWith(prefix)) return false;

  const provided = header.slice(prefix.length).trim();
  if (!/^[0-9a-f]{64}$/i.test(provided)) return false;

  const expected = createHmac("sha256", appSecret)
    .update(typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody)
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided.toLowerCase(), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** The exact callback URL Meta needs in the app's Webhook settings. */
export function webhookUrl(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/api/webhooks/meta`;
}
