import { randomInt } from "crypto";
import { prisma } from "./db";
import { sha256 } from "./auth";
import { ApiError, badRequest, notConfigured } from "./errors";

/**
 * ============================================================
 * Email (Gmail) verification codes for signup & login
 * ============================================================
 *
 * Storage — the Prisma schema is read-only (no OTP table exists), so codes
 * live in the existing SiteSetting key/value store under `otp:` keys:
 *
 *   key   = "otp:{purpose}:{email}"
 *   value = { h: sha256(purpose:email:code:AUTH_SECRET), exp, attempts, payload? }
 *
 * Only a HASH of the code is persisted (a DB read never yields a usable
 * code), every row expires after OTP_TTL_MS, and is deleted after 5 wrong
 * attempts or on successful use. getSettings() skips `otp:` keys so codes
 * can never leak through the admin settings API.
 *
 * Delivery — real Gmail SMTP when SMTP_* is configured in .env:
 *   1. Set SMTP_HOST/SMTP_USER/SMTP_PASS (+ optional SMTP_FROM)
 *   2. Set OTP_DEV_MODE="false"
 * Without SMTP, OTP_DEV_MODE="true" allows the flow to keep working by
 * returning the code in the API response and logging it server-side —
 * clearly reported as delivery:"dev", never as a sent email.
 * Without either → NOT_CONFIGURED error (no fake success).
 */

export type OtpPurpose = "register" | "login";

export const OTP_TTL_MS = 10 * 60_000; // 10 minutes
const OTP_MAX_ATTEMPTS = 5;
const OTP_PREFIX = "otp:";

export interface OtpIssueResult {
  email: string;
  /** "email" = real Gmail SMTP send · "dev" = no SMTP configured (OTP_DEV_MODE) */
  delivery: "email" | "dev";
  /** Only present in dev delivery — lets the UI show the code on screen. */
  devCode?: string;
}

interface OtpRecord {
  h: string;
  exp: number;
  attempts: number;
  /** register: pending account fields · login: target userId */
  payload?: Record<string, unknown>;
}

function otpKey(purpose: OtpPurpose, email: string): string {
  return `${OTP_PREFIX}${purpose}:${email.toLowerCase()}`;
}

function hashCode(purpose: OtpPurpose, email: string, code: string): string {
  return sha256(`${purpose}:${email.toLowerCase()}:${code}:${process.env.AUTH_SECRET ?? ""}`);
}

function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function devMode(): boolean {
  return process.env.OTP_DEV_MODE === "true";
}

/** Drop expired OTP rows (called on every issue — keeps the table tiny). */
async function cleanupExpired(): Promise<void> {
  try {
    const rows = await prisma.siteSetting.findMany({
      where: { key: { startsWith: OTP_PREFIX } },
      select: { key: true, value: true },
    });
    const now = Date.now();
    const stale = rows.filter((r) => {
      const v = r.value as unknown as OtpRecord;
      return !v || typeof v.exp !== "number" || v.exp < now;
    });
    if (stale.length) {
      await prisma.siteSetting.deleteMany({ where: { key: { in: stale.map((r) => r.key) } } });
    }
  } catch (err) {
    console.error("[otp] cleanup failed:", err);
  }
}

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Real Gmail SMTP send. Throws NOT_CONFIGURED when credentials are absent. */
async function sendOtpEmail(to: string, code: string, purpose: OtpPurpose): Promise<void> {
  if (!smtpConfigured()) {
    throw notConfigured(
      "Email verification is not configured on this server. Add SMTP_HOST, SMTP_USER and SMTP_PASS to .env and set OTP_DEV_MODE=false."
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
      // Gmail App Passwords print as 16 chars in 4-char groups — people often
      // paste them with spaces, which Gmail rejects on auth. Strip whitespace.
      pass: (process.env.SMTP_PASS ?? "").replace(/\s+/g, ""),
    },
  });

  const label = purpose === "register" ? "confirm your Imalissa account" : "sign in to Imalissa";
  try {
    await transport.sendMail({
    from: process.env.SMTP_FROM || `Imalissa <${process.env.SMTP_USER!}>`,
    to,
    subject: `Your Imalissa verification code: ${code}`,
    text:
      `Your verification code is ${code}\n\n` +
      `Enter it to ${label}. The code expires in 10 minutes.\n` +
      `If you did not request this, you can safely ignore this email.\n\n` +
      `— Team Imalissa`,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;background:#0b0d10;padding:32px 16px;color:#e8eaed">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#12151b;border:1px solid #262a33;border-radius:16px">
          <tr><td style="padding:28px 28px 8px">
            <p style="margin:0;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#d4af37">Imalissa · Email verification</p>
            <h1 style="margin:14px 0 6px;font-size:21px;color:#f4f5f7">Your verification code</h1>
            <p style="margin:0;font-size:14px;color:#9aa1ad">Enter this code to ${label}:</p>
          </td></tr>
          <tr><td style="padding:14px 28px">
            <div style="font-family:Consolas,Menlo,monospace;font-size:34px;letter-spacing:.34em;font-weight:bold;color:#d4af37;background:#1a1e26;border:1px dashed #d4af37;border-radius:12px;padding:16px 8px;text-align:center">${code}</div>
          </td></tr>
          <tr><td style="padding:6px 28px 28px">
            <p style="margin:14px 0 0;font-size:13px;color:#9aa1ad">This code expires in <strong>10 minutes</strong>. Never share it — Imalissa staff will never ask for it.</p>
            <p style="margin:10px 0 0;font-size:13px;color:#5f6672">If you didn't request this email, ignore it. No account changes were made.</p>
          </td></tr>
        </table>
      </div>`,
    });
  } catch (err) {
    // Real SMTP failure (bad app password, quota, network) — report honestly
    // instead of pretending the code was sent. Full detail goes to the log.
    console.error("[otp] SMTP send failed:", err);
    throw new ApiError(
      502,
      "Could not send the verification email right now. Please try again in a few minutes."
    );
  }
}

/**
 * Issue a fresh 6-digit code for `email` and deliver it.
 * Overwrites any previous code for the same purpose+email.
 * Throws NOT_CONFIGURED when SMTP is missing and OTP_DEV_MODE is off.
 */
export async function issueOtp(
  purpose: OtpPurpose,
  email: string,
  payload?: Record<string, unknown>
): Promise<OtpIssueResult> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw badRequest("Email is required for verification");

  await cleanupExpired();

  const code = generateCode();
  const record: OtpRecord = {
    h: hashCode(purpose, normalized, code),
    exp: Date.now() + OTP_TTL_MS,
    attempts: 0,
    ...(payload ? { payload } : {}),
  };

  // Persist BEFORE sending so the code can never arrive without being valid.
  await prisma.siteSetting.upsert({
    where: { key: otpKey(purpose, normalized) },
    update: { value: record as unknown as object, group: "otp" },
    create: { key: otpKey(purpose, normalized), value: record as unknown as object, group: "otp" },
  });

  if (smtpConfigured()) {
    await sendOtpEmail(normalized, code, purpose);
    return { email: normalized, delivery: "email" };
  }

  if (devMode()) {
    // Explicit opt-in development delivery — no email is claimed to be sent.
    console.log(`[otp][DEV] purpose=${purpose} email=${normalized} code=${code}`);
    return { email: normalized, delivery: "dev", devCode: code };
  }

  throw notConfigured(
    "Email verification is not configured. Set SMTP_* credentials in .env (or OTP_DEV_MODE=true during development)."
  );
}

/**
 * Verify a code. Returns the payload stored at issue time.
 * Throws 400 on missing / expired / wrong code (after OTP_MAX_ATTEMPTS the
 * record is destroyed and a new code must be requested).
 */
export async function verifyOtp(
  purpose: OtpPurpose,
  email: string,
  code: string
): Promise<Record<string, unknown>> {
  const normalized = email.trim().toLowerCase();
  const key = otpKey(purpose, normalized);
  const row = await prisma.siteSetting.findUnique({ where: { key } });

  if (!row) {
    throw badRequest("That verification code has expired or was already used. Please request a new one.");
  }

  const record = row.value as unknown as OtpRecord;
  if (!record?.exp || record.exp < Date.now()) {
    await prisma.siteSetting.delete({ where: { key } }).catch(() => undefined);
    throw badRequest("That verification code has expired. Please request a new one.");
  }

  if ((record.attempts ?? 0) >= OTP_MAX_ATTEMPTS) {
    await prisma.siteSetting.delete({ where: { key } }).catch(() => undefined);
    throw badRequest("Too many wrong attempts — the code was cancelled. Please request a new one.");
  }

  const trimmed = code.trim();
  if (record.h !== hashCode(purpose, normalized, trimmed)) {
    record.attempts = (record.attempts ?? 0) + 1;
    const left = OTP_MAX_ATTEMPTS - record.attempts;
    await prisma.siteSetting.update({
      where: { key },
      data: { value: record as unknown as object },
    });
    if (left <= 0) {
      await prisma.siteSetting.delete({ where: { key } }).catch(() => undefined);
      throw badRequest("Too many wrong attempts — the code was cancelled. Please request a new one.");
    }
    throw badRequest(`Incorrect verification code. ${left} attempt${left === 1 ? "" : "s"} left.`);
  }

  // Single use: delete before acting on the payload.
  await prisma.siteSetting.delete({ where: { key } }).catch(() => undefined);
  return (record.payload ?? {}) as Record<string, unknown>;
}
