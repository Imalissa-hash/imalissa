import { ApiError, notConfigured } from "./errors";

/**
 * ============================================================
 * Small SMTP helper (admin → customer emails)
 * ============================================================
 *
 * Same honesty rules as lib/otp.ts and lib/password-reset.ts:
 *   - SMTP_* missing        → NOT_CONFIGURED (503), never a fake "sent"
 *   - transport send fails  → 502 with a public message, detail to the log
 *
 * Kept separate from otp.ts so the live signup/sign-in path stays untouched.
 */

export function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export interface MailPayload {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Optional reply-to (unused by current senders). */
  replyTo?: string;
}

/** Send one email. Throws (503 / 502) instead of pretending it worked. */
export async function sendMail(payload: MailPayload): Promise<void> {
  if (!smtpConfigured()) {
    throw notConfigured(
      "Email is not configured on this server. Add SMTP_HOST, SMTP_USER and SMTP_PASS to .env."
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
    console.error("[mail] send failed:", err);
    throw new ApiError(502, "Could not send the email right now. Please try again in a few minutes.");
  }
}
