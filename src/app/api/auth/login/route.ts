import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, rateLimit, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { hashPassword, needsRehash, verifyPassword } from "@/lib/auth";
import { badRequest, unauthorized } from "@/lib/errors";
import { issueOtp } from "@/lib/otp";

/**
 * Step 1 of login with Gmail verification.
 *
 * The password is checked FIRST (no code is ever sent to an address that
 * didn't prove the password — prevents email bombing / enumeration), then a
 * code is issued to the account's email. No session cookie is set here:
 * /api/auth/verify-otp is what starts the session.
 *
 * Response: { otpRequired: true, email, delivery, devCode? }
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

  if (!user.email) {
    // Every account created from now on has an email (signup requires it for
    // the OTP). A legacy account without one cannot be code-verified.
    throw badRequest(
      "This account has no email address, so a verification code cannot be sent. Please contact support to add one."
    );
  }

  const otp = await issueOtp("login", user.email, { userId: user.id });

  return jsonOk({
    otpRequired: true,
    email: otp.email,
    delivery: otp.delivery,
    ...(otp.devCode ? { devCode: otp.devCode } : {}),
  });
});

export const dynamic = "force-dynamic";
