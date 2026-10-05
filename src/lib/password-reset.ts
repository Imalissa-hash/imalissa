import { randomBytes } from "crypto";
import { prisma } from "./db";
import { sha256 } from "./auth";
import { ApiError, badRequest, notConfigured } from "./errors";

/**
 * ============================================================
 * Password reset links (customer + admin)
 * ============================================================
 *
 * Storage — the Prisma schema is read-only (no reset table exists), so the
 * row lives in the existing SiteSetting key/value store under
 * `reset:{scope}:{email}` — the same trick lib/otp.ts uses for codes:
 *
 *   key   = "reset:{scope}:{email}"
 *   value = { h: sha256(scope:email:token:AUTH_SECRET), exp, attempts }
 *
 * Only a HASH of the token is persisted (a DB read never yields a usable
 * link), the link expires after RESET_TTL_MS, is single-use (deleted the
 * moment it is consumed) and dies after RESET_MAX_ATTEMPTS wrong tries.
 * Requesting a new link overwrites the previous one, so an older email
 * stops working. getSettings() skips `reset:` keys, so rows can never
 * leak through the admin settings API.
 *
 * Delivery — real Gmail SMTP when SMTP_* is configured in .env:
 *   1. Set SMTP_HOST/SMTP_USER/SMTP_PASS (+ optional SMTP_FROM)
 *   2. Set OTP_DEV_MODE="false"
 * Without SMTP, OTP_DEV_MODE="true" returns the link in the API response
 * as `devLink` and logs it — clearly reported as delivery:"dev", never as
 * a sent email. Without either → NOT_CONFIGURED error (no fake success).
 */

/** Scope picks the account table AND the page the emailed link opens. */
export type ResetScope = "user" | "admin";

export const RESET_TTL_MS = 15 * 60_000; // 15 minutes
const RESET_MAX_ATTEMPTS = 5;
const RESET_PREFIX = "reset:";

export interface ResetIssueResult {
  /** "email" = real Gmail SMTP send · "dev" = no SMTP configured (OTP_DEV_MODE) */
  delivery: "email" | "dev";
  /** Only present in dev delivery — lets the UI open the link without SMTP. */
  devLink?: string;
}

interface ResetRecord {
  /** Hash of the token — the raw token exists only in the emailed link. */
  h: string;
  exp: number;
  attempts: number;
}

function resetKey(scope: ResetScope, email: string): string {
  return `${RESET_PREFIX}${scope}:${email.toLowerCase()}`;
}

function hashToken(scope: ResetScope, email: string, token: string): string {
  return sha256(`${scope}:${email.toLowerCase()}:${token}:${process.env.AUTH_SECRET ?? ""}`);
}

function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function devMode(): boolean {
  return process.env.OTP_DEV_MODE === "true";
}

/** 32 random bytes — unguessable, so a link is safe to put in an email. */
function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

function resetPath(scope: ResetScope): string {
  return scope === "admin" ? "/admin/reset" : "/auth/reset";
}

/**
 * Absolute origin for the emailed link: the request origin wins (correct for
 * localhost, the LAN IP and a reverse proxy that forwards Host), then
 * NEXT_PUBLIC_SITE_URL, then localhost.
 */
function resolveBase(explicitOrigin?: string): string {
  const fromReq = (explicitOrigin ?? "").trim().replace(/\/+$/, "");
  if (/^https?:\/\/.+/.test(fromReq)) return fromReq;
  const fromEnv = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");
  if (/^https?:\/\/.+/.test(fromEnv)) return fromEnv;
  return "http://localhost:3000";
}

/** Drop expired reset rows (called on every issue — keeps the table tiny). */
async function cleanupExpired(): Promise<void> {
  try {
    const rows = await prisma.siteSetting.findMany({
      where: { key: { startsWith: RESET_PREFIX } },
      select: { key: true, value: true },
    });
    const now = Date.now();
    const stale = rows.filter((r) => {
      const v = r.value as unknown as ResetRecord;
      return !v || typeof v.exp !== "number" || v.exp < now;
    });
    if (stale.length) {
      await prisma.siteSetting.deleteMany({ where: { key: { in: stale.map((r) => r.key) } } });
    }
  } catch (err) {
    console.error("[reset] cleanup failed:", err);
  }
}

/**
 * Real Gmail SMTP send for the reset link. Throws NOT_CONFIGURED when
 * credentials are absent and a 502 when the send itself fails.
 *
 * The transport is built here (mirroring lib/otp.ts) on purpose: otp.ts is
 * the live signup/sign-in path and is not touched by this feature.
 */
async function sendResetEmail(to: string, link: string, scope: ResetScope): Promise<void> {
  if (!smtpConfigured()) {
    throw notConfigured(
      "Password reset email is not configured on this server. Add SMTP_HOST, SMTP_USER and SMTP_PASS to .env and set OTP_DEV_MODE=false."
    );
  }

  const host = process.env.SMTP_HOST!;
  const port = Number(process.env.SMTP_PORT || 587);
  const nodemailer = (await import("nodemailer")).default;
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER!.trim(),
      // Gmail app passwords are often pasted with spaces — Gmail rejects them.
      pass: (process.env.SMTP_PASS ?? "").replace(/\s+/g, ""),
    },
  });

  const audience =
    scope === "admin"
      ? "your Imalissa admin account"
      : "your Imalissa account";

  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM || `Imalissa <${process.env.SMTP_USER!}>`,
      to,
      subject: "Reset your Imalissa password",
      text:
        `Someone asked to reset the password for ${audience} (${to}).\n\n` +
        `Open this link to choose a new password:\n${link}\n\n` +
        `The link works once and expires in 15 minutes.\n` +
        `If you did not request this, you can safely ignore this email — your password has not changed.\n\n` +
        `— Team Imalissa`,
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;background:#0b0d10;padding:32px 16px;color:#e8eaed">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#12151b;border:1px solid #262a33;border-radius:16px">
            <tr><td style="padding:28px 28px 8px">
              <p style="margin:0;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#d4af37">Imalissa · Password reset</p>
              <h1 style="margin:14px 0 6px;font-size:21px;color:#f4f5f7">Reset your password</h1>
              <p style="margin:0;font-size:14px;color:#9aa1ad">We received a request to reset the password for <strong style="color:#e8eaed">${audience}</strong>. Choose a new password with the button below:</p>
            </td></tr>
            <tr><td style="padding:18px 28px">
              <a href="${link}" style="display:block;text-align:center;background:#d4af37;color:#12151b;font-weight:bold;font-size:15px;text-decoration:none;border-radius:10px;padding:14px 18px">Set a new password</a>
              <p style="margin:14px 0 0;font-size:12px;color:#5f6672;word-break:break-all">Button not working? Paste this link into your browser:<br>${link}</p>
            </td></tr>
            <tr><td style="padding:6px 28px 28px">
              <p style="margin:0;font-size:13px;color:#9aa1ad">This link works <strong>once</strong> and expires in <strong>15 minutes</strong>. Never share it — Imalissa staff will never ask for it.</p>
              <p style="margin:10px 0 0;font-size:13px;color:#5f6672">If you didn't request this email, ignore it. No account changes were made.</p>
            </td></tr>
          </table>
        </div>`,
    });
  } catch (err) {
    // Real SMTP failure (bad app password, quota, network) — report honestly
    // instead of pretending the link was sent. Full detail goes to the log.
    console.error("[reset] SMTP send failed:", err);
    throw new ApiError(
      502,
      "Could not send the reset email right now. Please try again in a few minutes."
    );
  }
}

/**
 * Issue a fresh reset link for `email` and deliver it.
 * Overwrites any previous link for the same scope+email.
 * Throws NOT_CONFIGURED when SMTP is missing and OTP_DEV_MODE is off.
 */
export async function issueResetLink(
  scope: ResetScope,
  email: string,
  origin?: string
): Promise<ResetIssueResult> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw badRequest("Email is required for a reset link");

  await cleanupExpired();

  const token = generateToken();
  const record: ResetRecord = {
    h: hashToken(scope, normalized, token),
    exp: Date.now() + RESET_TTL_MS,
    attempts: 0,
  };

  // Persist BEFORE sending so a link can never arrive without being valid.
  await prisma.siteSetting.upsert({
    where: { key: resetKey(scope, normalized) },
    update: { value: record as unknown as object, group: "reset" },
    create: { key: resetKey(scope, normalized), value: record as unknown as object, group: "reset" },
  });

  const link = `${resolveBase(origin)}${resetPath(scope)}?e=${encodeURIComponent(normalized)}&t=${token}`;

  if (smtpConfigured()) {
    await sendResetEmail(normalized, link, scope);
    return { delivery: "email" };
  }

  if (devMode()) {
    // Explicit opt-in development delivery — no email is claimed to be sent.
    console.log(`[reset][DEV] scope=${scope} email=${normalized} link=${link}`);
    return { delivery: "dev", devLink: link };
  }

  throw notConfigured(
    "Password reset email is not configured. Set SMTP_* credentials in .env (or OTP_DEV_MODE=true during development)."
  );
}

/**
 * Verify + burn a reset token. Throws 400 on missing / expired / wrong token
 * (after RESET_MAX_ATTEMPTS the row is destroyed and a new link is required).
 * Returns nothing — the caller applies the new password afterwards.
 */
export async function consumeResetToken(
  scope: ResetScope,
  email: string,
  token: string
): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const key = resetKey(scope, normalized);
  const row = await prisma.siteSetting.findUnique({ where: { key } });

  if (!row) {
    throw badRequest(
      "This reset link is invalid or has already been used. Please request a new one."
    );
  }

  const record = row.value as unknown as ResetRecord;
  if (!record?.exp || record.exp < Date.now()) {
    await prisma.siteSetting.delete({ where: { key } }).catch(() => undefined);
    throw badRequest("This reset link has expired. Please request a new one.");
  }

  if ((record.attempts ?? 0) >= RESET_MAX_ATTEMPTS) {
    await prisma.siteSetting.delete({ where: { key } }).catch(() => undefined);
    throw badRequest("Too many invalid attempts — this reset link was cancelled. Please request a new one.");
  }

  const trimmed = (token ?? "").trim();
  if (record.h !== hashToken(scope, normalized, trimmed)) {
    record.attempts = (record.attempts ?? 0) + 1;
    await prisma.siteSetting.update({
      where: { key },
      data: { value: record as unknown as object },
    });
    if (record.attempts >= RESET_MAX_ATTEMPTS) {
      await prisma.siteSetting.delete({ where: { key } }).catch(() => undefined);
      throw badRequest("Too many invalid attempts — this reset link was cancelled. Please request a new one.");
    }
    throw badRequest("This reset link is not valid. Please request a new one.");
  }

  // Single use: burn it before the caller acts on it.
  await prisma.siteSetting.delete({ where: { key } }).catch(() => undefined);
}
