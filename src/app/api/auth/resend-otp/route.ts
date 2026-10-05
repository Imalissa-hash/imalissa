import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, rateLimit, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { badRequest } from "@/lib/errors";
import { issueOtp, type OtpPurpose } from "@/lib/otp";

/**
 * Request a fresh code for an interrupted signup / sign-in.
 *
 *   POST { purpose: "register" | "login", email }
 *
 * login is only re-issued for an EXISTING account (this endpoint cannot be
 * used to spam an address that never signed in). register re-issues only
 * when a pending signup row is still waiting for its code.
 */
const schema = z.object({
  purpose: z.enum(["register", "login"]),
  email: z.string().email("Enter your email address"),
});

export const POST = withApi(async (req: NextRequest) => {
  const body = parseBody(schema, await req.json().catch(() => ({})));
  const email = body.email.trim().toLowerCase();
  const purpose: OtpPurpose = body.purpose;

  rateLimit(`otp-resend:${clientIp(req)}`, 4, 60_000);
  rateLimit(`otp-resend:${email}`, 4, 60_000);

  if (purpose === "login") {
    // Only resend while a login challenge is actually open — the row is
    // created by POST /api/auth/login AFTER the password check. Without this
    // gate, anyone could fire codes at any registered address, and because a
    // verified code starts the session, mailbox access alone would be enough
    // to sign in without the password.
    const pending = await prisma.siteSetting.findUnique({
      where: { key: `otp:login:${email}` },
    });
    if (!pending) {
      // Identical answer whether or not the account exists (no enumeration).
      throw badRequest("Your sign-in session expired. Please sign in again.");
    }
    const prev = pending.value as unknown as { payload?: Record<string, unknown> };
    const otp = await issueOtp("login", email, prev.payload);
    return jsonOk({
      ok: true,
      email: otp.email,
      delivery: otp.delivery,
      ...(otp.devCode ? { devCode: otp.devCode } : {}),
    });
  }

  // register: only resend when the previous code (with its held payload) is
  // still alive — otherwise the user must start signup again.
  const row = await prisma.siteSetting.findUnique({ where: { key: `otp:register:${email}` } });
  if (!row) throw badRequest("Your signup session expired. Please sign up again.");

  const prev = row.value as unknown as { payload?: Record<string, unknown> };
  const otp = await issueOtp("register", email, prev.payload);

  return jsonOk({
    ok: true,
    email: otp.email,
    delivery: otp.delivery,
    ...(otp.devCode ? { devCode: otp.devCode } : {}),
  });
});

export const dynamic = "force-dynamic";
