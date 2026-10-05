import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, rateLimit, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { startAdminSession } from "@/lib/admin-auth";
import { unauthorized } from "@/lib/errors";
import { audit } from "@/lib/audit";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

/** POST /api/admin/auth/login — admin sign-in (separate session table). */
export const POST = withApi(async (req: NextRequest) => {
  rateLimit(`admin-login:${clientIp(req)}`, 6, 60_000);
  const body = parseBody(schema, await req.json().catch(() => ({})));
  const email = body.email.trim().toLowerCase();

  const admin = await prisma.adminUser.findUnique({ where: { email } });
  if (!admin || !admin.isActive) throw unauthorized("Invalid credentials");

  const ok = await verifyPassword(body.password, admin.passwordHash);
  if (!ok) throw unauthorized("Invalid credentials");

  await startAdminSession(admin.id, clientIp(req), req.headers.get("user-agent") ?? undefined);
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });
  await audit({
    adminId: admin.id,
    action: "ADMIN_LOGIN",
    entityType: "AdminUser",
    entityId: admin.id,
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({ id: admin.id, name: admin.name, email: admin.email, role: admin.role });
});

export const dynamic = "force-dynamic";
