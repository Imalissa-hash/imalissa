import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, rateLimit, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { hashPassword, needsRehash, startSession, verifyPassword } from "@/lib/auth";
import { badRequest, unauthorized } from "@/lib/errors";
import { issueOtp, otpAvailable } from "@/lib/otp";
import { mergeCarts } from "@/lib/cart";
import { cookies } from "next/headers";

/**
 * Step 1 of sign-in: password first, then — when codes can be delivered —
 * the emailed 6-digit code. No session cookie is set on the code path:
 * /api/auth/verify-otp is what starts the session after the code matches.
 *
 * The password is checked FIRST (no code is ever sent to an address that
 * didn't prove the password — prevents email bombing / enumeration).
 *
 * Response with a channel: { otpRequired: true, email, delivery, devCode? }
 * Response with no channel (or a failed send): { id, name, email, phone } —
 * password-only sign-in, the same behavior as before the code step existed.
 * A broken mail channel must never lock customers out of their own accounts,
 * and nothing here ever claims an email was sent that was not.
 */
const schema = z.object({
  identifier: z.string().min(3, "Enter your email or phone"),
  password: z.string().min(1, "Enter your password"),
});

export const POST = withApi(async (req: NextRequest) => {
  rateLimit(`login:${clientIp(req)}`, 8, 60_000);
  const body = parseBody(schema, await req.json().catch(() => ({})));
  const id = body.identifier.trim().toLowerCase();

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: id }, { phone: body.identifier.trim() }] },
  });

  // Same error for unknown user vs wrong password (no account enumeration).
  if (!user) throw unauthorized("Invalid credentials. Please try again.");

  const ok = await verifyPassword(body.password, user.passwordHash);
  if (!ok) throw unauthorized("Invalid credentials. Please try again.");

  // Legacy cost-12 hashes cost seconds to verify; the plaintext is in hand
  // right now, so upgrade the row for the next login. A failure here must
  // never block the login itself.
  if (needsRehash(user.passwordHash)) {
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(body.password) },
      });
    } catch {
      /* stays on the old hash until the next successful login */
    }
  }

  if (user.status === "BLOCKED") throw badRequest("Your account has been suspended. Contact support.");

  // Emailed code step — only when a channel can actually deliver the code.
  if (otpAvailable()) {
    if (!user.email) {
      // Every account created from now on has an email (signup requires it for
      // the OTP). A legacy account without one cannot be code-verified.
      throw badRequest(
        "This account has no email address, so a verification code cannot be sent. Please contact support to add one."
      );
    }
    try {
      const otp = await issueOtp("login", user.email, { userId: user.id });
      // No session yet — /api/auth/verify-otp starts it once the code matches.
      return jsonOk({
        otpRequired: true,
        email: otp.email,
        delivery: otp.delivery,
        ...(otp.devCode ? { devCode: otp.devCode } : {}),
      });
    } catch (err) {
      // Channel configured but the send failed (blocked port, bad key, quota).
      // issueOtp already logged the real failure; falling through signs the
      // customer in with the verified password instead of locking them out.
      console.error("[auth] login: verification code unavailable — password-only sign-in:", err);
      // Drop the half-open challenge so no code path survives next to the
      // password-only session started below (verify/resend would otherwise
      // still find the row until it expires).
      await prisma.siteSetting
        .delete({ where: { key: `otp:login:${user.email}` } })
        .catch(() => undefined);
    }
  }

  // Password-only path (no channel / failed send): merge any guest cart,
  // then start the session right away (the same steps
  // /api/auth/verify-otp runs after the code matched).
  const store = await cookies();
  const guest = store.get("imalissa_guest")?.value ?? null;
  if (guest) await mergeCarts(user.id, guest);

  await startSession(user.id, clientIp(req), req.headers.get("user-agent") ?? undefined);

  return jsonOk({ id: user.id, name: user.name, email: user.email, phone: user.phone });
});

export const dynamic = "force-dynamic";
