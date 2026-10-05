import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, rateLimit, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { badRequest } from "@/lib/errors";
import { consumeResetToken } from "@/lib/password-reset";
import { isStrongPassword } from "@/lib/validation";
import { audit } from "@/lib/audit";

/**
 * POST /api/admin/auth/reset — burn an admin reset link and store the new password.
 *
 *   { email, token, password }  →  { message }
 *
 * Mirrors /api/auth/reset with the admin scope:
 *   1. the account is looked up first (a link for an address that no longer
 *      exists — or was deactivated — stays invalid),
 *   2. the token is verified and deleted (single use, 15 min, 5 wrong tries),
 *   3. the hash is written and EVERY admin session for that account is
 *      revoked, so a stolen session cannot outlive the reset,
 *   4. the change is written to the audit log.
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
  rateLimit(`admin-pw-reset:${clientIp(req)}`, 10, 10 * 60_000);

  const body = parseBody(schema, await req.json().catch(() => ({})));
  const email = body.email.trim().toLowerCase();

  const admin = await prisma.adminUser.findUnique({ where: { email } });
  if (!admin || !admin.isActive) {
    throw badRequest(
      "This reset link is invalid or has already been used. Please request a new one."
    );
  }

  await consumeResetToken("admin", email, body.token);

  const passwordHash = await hashPassword(body.password);
  await prisma.$transaction([
    prisma.adminUser.update({ where: { id: admin.id }, data: { passwordHash } }),
    // Sign out everywhere — a compromised device must not survive a reset.
    prisma.adminSession.deleteMany({ where: { adminId: admin.id } }),
  ]);

  await audit({
    adminId: admin.id,
    action: "ADMIN_PASSWORD_RESET",
    entityType: "AdminUser",
    entityId: admin.id,
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({ message: "Password updated. You can sign in with your new password now." });
});

export const dynamic = "force-dynamic";
