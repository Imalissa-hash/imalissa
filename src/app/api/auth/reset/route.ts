import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, rateLimit, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { badRequest } from "@/lib/errors";
import { consumeResetToken } from "@/lib/password-reset";
import { isStrongPassword } from "@/lib/validation";

/**
 * POST /api/auth/reset — burn a reset link and store the new password.
 *
 *   { email, token, password }  →  { message }
 *
 * Order matters: the account is looked up first (a link for an address that
 * no longer exists stays invalid), then the token is verified and deleted
 * (single use), then the hash is written and every session for that user is
 * revoked — devices that were signed in must authenticate again.
 */
const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  token: z.string().min(20, "This reset link is not valid").max(200, "This reset link is not valid"),
  password: z
    .string()
    .min(8, "Use 8+ characters with letters and numbers")
    .refine(isStrongPassword, "Use 8+ characters with letters and numbers"),
});

export const POST = withApi(async (req: NextRequest) => {
  rateLimit(`pw-reset:${clientIp(req)}`, 10, 10 * 60_000);

  const body = parseBody(schema, await req.json().catch(() => ({})));
  const email = body.email.trim().toLowerCase();

  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) {
    throw badRequest(
      "This reset link is invalid or has already been used. Please request a new one."
    );
  }

  await consumeResetToken("user", email, body.token);

  const passwordHash = await hashPassword(body.password);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    // Sign the account out everywhere — a stolen session must not survive a reset.
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ]);

  return jsonOk({ message: "Password updated. You can sign in with your new password now." });
});

export const dynamic = "force-dynamic";
