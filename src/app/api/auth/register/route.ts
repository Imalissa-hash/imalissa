import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, rateLimit, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { hashPassword, startSession } from "@/lib/auth";
import { badRequest, conflict } from "@/lib/errors";
import { issueOtp, otpAvailable } from "@/lib/otp";
import { mergeCarts } from "@/lib/cart";
import { cookies } from "next/headers";

/**
 * Step 1 of signup with email verification.
 *
 * When codes can be delivered (Brevo HTTPS / Gmail SMTP / dev mode) nothing
 * is written to the user table yet: the pending account (password only as a
 * hash) is handed to issueOtp("register", email) and only
 * /api/auth/verify-otp creates the account + session. Email is therefore
 * REQUIRED — it is the OTP channel.
 *
 * With NO mail channel the signup completes in one step (create + session),
 * exactly as before the code step existed — a server without mail config
 * must still be able to register customers, and no email is ever claimed
 * as sent without a real send.
 *
 * Response with a channel: { otpRequired: true, email, delivery, devCode? }
 * Response without one:    { id, name, email, phone }
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

  // Emailed code step — hold the pending account until the code is confirmed
  // (issueOtp reports NOT_CONFIGURED / 502 honestly if the channel cannot
  // deliver; that failure falls through to one-step signup below so a broken
  // mail setup never blocks new customers — and never fakes a sent email).
  if (otpAvailable()) {
    try {
      const otp = await issueOtp("register", email, {
        name: body.name.trim(),
        email,
        phone: body.phone,
        passwordHash: await hashPassword(body.password),
      });
      // No account and no session yet — /api/auth/verify-otp does both.
      return jsonOk({
        otpRequired: true,
        email: otp.email,
        delivery: otp.delivery,
        ...(otp.devCode ? { devCode: otp.devCode } : {}),
      });
    } catch (err) {
      console.error("[auth] register: verification code unavailable — signing up without the code step:", err);
      // No code was delivered — clear the pending row so a stale challenge
      // cannot sit next to the account created directly below.
      await prisma.siteSetting
        .delete({ where: { key: `otp:register:${email}` } })
        .catch(() => undefined);
    }
  }

  // One-step signup (no channel / failed send): create the account and sign
  // the customer in (the unique email/phone are enforced by the DB — the
  // pre-flight above covers normal double submits).
  let user;
  try {
    user = await prisma.user.create({
      data: {
        name: body.name.trim(),
        email,
        phone: body.phone,
        passwordHash: await hashPassword(body.password),
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      throw conflict("An account with this email or phone number already exists");
    }
    throw err;
  }

  // Merge any guest cart, then start the session immediately.
  const store = await cookies();
  const guest = store.get("imalissa_guest")?.value ?? null;
  if (guest) await mergeCarts(user.id, guest);

  await startSession(user.id, clientIp(req), req.headers.get("user-agent") ?? undefined);

  return jsonOk({ id: user.id, name: user.name, email: user.email, phone: user.phone });
});

export const dynamic = "force-dynamic";
