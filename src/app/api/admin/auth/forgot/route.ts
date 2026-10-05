import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, rateLimit, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { issueResetLink } from "@/lib/password-reset";

/**
 * POST /api/admin/auth/forgot — request a password reset link for the admin panel.
 *
 *   { email }  →  { message, devLink? }
 *
 * Same contract as /api/auth/forgot, scope "admin": the emailed link opens
 * /admin/reset and the token can only change that admin's password.
 *
 * No account enumeration: an unknown or deactivated address gets exactly the
 * same answer as a successful send (and nothing is sent for it). A real SMTP
 * failure still surfaces as an error — success is never faked.
 *
 * Deliberately unauthenticated — that is the point of the route — so it leans
 * on the rate limits below plus the 15-minute single-use token.
 */
const schema = z.object({
  email: z.string().email("Enter a valid email address"),
});

const MESSAGE =
  "If an admin account exists for that email, a reset link has been sent. It expires in 15 minutes — check your spam folder if you don't see it.";

export const POST = withApi(async (req: NextRequest) => {
  const body = parseBody(schema, await req.json().catch(() => ({})));
  const email = body.email.trim().toLowerCase();

  rateLimit(`admin-pw-forgot:${clientIp(req)}`, 5, 10 * 60_000);
  rateLimit(`admin-pw-forgot:${email}`, 3, 10 * 60_000);

  const admin = await prisma.adminUser.findFirst({ where: { email } });
  if (!admin || !admin.isActive) {
    // Same payload as a real send — the wording never claims an email went out.
    return jsonOk({ message: MESSAGE });
  }

  const result = await issueResetLink("admin", email, req.nextUrl.origin);

  return jsonOk({
    message: MESSAGE,
    ...(result.devLink ? { devLink: result.devLink } : {}),
  });
});

export const dynamic = "force-dynamic";
