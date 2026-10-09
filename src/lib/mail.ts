import { ApiError, notConfigured } from "./errors";

/**
 * ============================================================
 * Outgoing email — one shared channel
 * ============================================================
 *
 * Two real transports, chosen automatically:
 *
 *   1. Brevo HTTPS API — used when BREVO_API_KEY is set. Plain HTTPS (443),
 *      so it works on Render free, where outbound SMTP ports 25/465/587 are
 *      blocked (Render changelog 2025-09-16) and Gmail SMTP can never
 *      connect. The sender address must be verified in Brevo.
 *   2. Gmail SMTP — used when no Brevo key exists and SMTP_* are set.
 *      Local dev, and any paid Render instance (SMTP allowed there).
 *      Transport limits are explicit so a blocked/failed connection errors
 *      in seconds instead of waiting out the ~2 minute OS timeout — that
 *      hang was the endless sign-in spinner on the live site.
 *
 * Same honesty rules as lib/otp.ts and lib/password-reset.ts:
 *   - nothing configured → NOT_CONFIGURED (503), never a fake "sent"
 *   - send fails         → 502 with a public message, detail to the log
 *
 * Used by otp.ts (sign-in/registration codes), password-reset.ts and the
 * admin → customer message/email actions.
 */

export function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/** Brevo (HTTPS) is available as soon as a key exists — no other vars needed. */
export function brevoConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY?.trim());
}

/** True when ANY real delivery channel exists (Brevo key or SMTP_*). */
export function emailConfigured(): boolean {
  return brevoConfigured() || smtpConfigured();
}

export interface MailPayload {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Optional reply-to (unused by current senders). */
  replyTo?: string;
}

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const SEND_TIMEOUT_MS = 15_000;
const BREVO_PUBLIC_ERROR =
  "Could not send the email right now. Please try again in a few minutes.";

/** Brevo wants a bare address; our vars may hold "Name <a@b>". */
function brevoSender(): { email: string; name: string } {
  const raw =
    process.env.BREVO_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || "";
  const email = raw.replace(/^.*<([^>]+)>.*/, "$1").trim();
  return { email, name: "Imalissa" };
}

/** HTTPS send — works anywhere the app can reach port 443 (incl. Render free). */
async function sendViaBrevo(payload: MailPayload): Promise<void> {
  const key = process.env.BREVO_API_KEY!.trim();
  const sender = brevoSender();
  if (!sender.email) {
    throw notConfigured(
      "Brevo is configured without a sender address — set BREVO_FROM (or SMTP_USER) in .env."
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(BREVO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": key },
      body: JSON.stringify({
        sender,
        to: [{ email: payload.to }],
        subject: payload.subject,
        // Brevo's v3/smtp API only reads textContent/htmlContent — sending
        // text/html gets a 400 "Either of htmlContent or textContent is
        // required" and the code step silently falls back to one-step signup.
        textContent: payload.text,
        htmlContent: payload.html,
        ...(payload.replyTo ? { replyTo: { email: payload.replyTo } } : {}),
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 300);
      // Unverified sender / bad key / quota — say which in the server log
      // only; the public answer stays the generic 502.
      console.error(`[mail] Brevo rejected the send (HTTP ${res.status}): ${body}`);
      throw new ApiError(502, BREVO_PUBLIC_ERROR);
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    console.error("[mail] Brevo request failed:", err);
    throw new ApiError(502, BREVO_PUBLIC_ERROR);
  } finally {
    clearTimeout(timer);
  }
}

/** Gmail SMTP send — local dev / paid Render. Fail-fast on a dead connection. */
async function sendViaSmtp(payload: MailPayload): Promise<void> {
  const host = process.env.SMTP_HOST!;
  const port = Number(process.env.SMTP_PORT || 587);
  const nodemailer = (await import("nodemailer")).default;
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    // Render free blocks outbound SMTP (ports 25/465/587) — the connect is
    // dropped, so without these limits nodemailer waits out the OS timeout
    // (~2 min) and the form just spins. Fail in seconds and report the real
    // failure instead.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    auth: {
      user: process.env.SMTP_USER!.trim(),
      // Gmail app passwords are often pasted with spaces — Gmail rejects them.
      pass: (process.env.SMTP_PASS ?? "").replace(/\s+/g, ""),
    },
  });

  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM || `Imalissa <${process.env.SMTP_USER!}>`,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      ...(payload.replyTo ? { replyTo: payload.replyTo } : {}),
    });
  } catch (err) {
    console.error("[mail] SMTP send failed:", err);
    throw new ApiError(502, "Could not send the email right now. Please try again in a few minutes.");
  }
}

/**
 * Send one email through the available channel (Brevo first, SMTP second).
 * Throws (503 / 502) instead of pretending it worked.
 */
export async function sendMail(payload: MailPayload): Promise<void> {
  if (brevoConfigured()) return sendViaBrevo(payload);
  if (smtpConfigured()) return sendViaSmtp(payload);
  throw notConfigured(
    "Email is not configured on this server. Add BREVO_API_KEY (HTTPS — works on Render free) or SMTP_HOST, SMTP_USER and SMTP_PASS to .env."
  );
}
