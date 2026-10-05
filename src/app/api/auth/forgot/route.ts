import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, rateLimit, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { issueResetLink } from "@/lib/password-reset";

/**
 * POST /api/auth/forgot — request a password reset link.
 *
 *   { email }  →  { message, devLink? }
 *
 * No account enumeration: an unknown address gets exactly the same answer
 * as a successful send (and nothing is sent for it). A real SMTP failure
 * still surfaces as an error — success is never faked.
 */
const schema = z.object({
  email: z.string().email("Enter a valid email address"),
});

const MESSAGE =
  "If an account exists for that email, a reset link has been sent. It expires in 15 minutes — check your spam folder if you don't see it.";

export const POST = withApi(async (req: NextRequest) => {
  const body = parseBody(schema, await req.json().catch(() => ({})));
  const email = body.email.trim().toLowerCase();

  rateLimit(`pw-forgot:${clientIp(req)}`, 5, 10 * 60_000);
  rateLimit(`pw-forgot:${email}`, 3, 10 * 60_000);

  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) {
    // Same payload as a real send — the wording never claims an email went out.
    return jsonOk({ message: MESSAGE });
  }

  const result = await issueResetLink("user", email, req.nextUrl.origin);

  return jsonOk({
    message: MESSAGE,
    ...(result.devLink ? { devLink: result.devLink } : {}),
  });
});

export const dynamic = "force-dynamic";
