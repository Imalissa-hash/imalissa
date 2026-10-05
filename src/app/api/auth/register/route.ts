import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, rateLimit, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { badRequest, conflict } from "@/lib/errors";
import { issueOtp } from "@/lib/otp";

/**
 * Step 1 of signup with Gmail verification.
 *
 * Nothing is written to the user table yet. We validate, hash the password
 * and hand the whole pending account to issueOtp("register", email) — the
 * code is emailed to that address and only /api/auth/verify-otp creates the
 * account + session. Email is therefore REQUIRED (it is the OTP channel).
 *
 * Response: { otpRequired: true, email, delivery, devCode? }
 */
const registerSchema = z.object({
  name: z.string().min(2, "Please enter your name").max(80),
  email: z.string().email("Please enter a valid email").min(5),
  phone: z
    .string()
    .regex(/^01[3-9]\d{8}$/, "Enter a valid BD mobile number (e.g. 01712345678)"),
  password: z.string().min(6, "Password must be at least 6 characters").max(72),
});

export const POST = withApi(async (req: NextRequest) => {
  rateLimit(`register:${clientIp(req)}`, 5, 60_000);
  const body = parseBody(registerSchema, await req.json().catch(() => ({})));
  const email = body.email.trim().toLowerCase();

  const dup = await prisma.user.findFirst({
    where: { OR: [{ email }, { phone: body.phone }] },
  });
  if (dup) {
    throw conflict(
      dup.email && dup.email === email
        ? "An account with this email already exists"
        : "An account with this phone number already exists"
    );
  }

  // Hold the pending account (password stored only as a hash) until the
  // emailed code is confirmed — issueOtp throws 503 NOT_CONFIGURED when no
  // SMTP is configured and dev mode is off (never a fake "email sent").
  const otp = await issueOtp("register", email, {
    name: body.name.trim(),
    email,
    phone: body.phone,
    passwordHash: await hashPassword(body.password),
  });

  return jsonOk({
    otpRequired: true,
    email: otp.email,
    delivery: otp.delivery,
    ...(otp.devCode ? { devCode: otp.devCode } : {}),
  });
});

export const dynamic = "force-dynamic";
