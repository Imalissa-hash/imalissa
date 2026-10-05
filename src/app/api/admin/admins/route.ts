import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, rateLimit, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAdmin, requireRole } from "@/lib/admin-auth";
import { hashPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { conflict } from "@/lib/errors";

/**
 * Admin accounts API.
 *  - GET  — any signed-in admin may VIEW the list (no password material
 *           is ever selected or returned). This lets non-SUPER_ADMIN
 *           roles render the page read-only; mutations below are
 *           restricted to SUPER_ADMIN and answer 403 honestly.
 *  - POST — SUPER_ADMIN only (requireRole() with NO role args passes
 *           only for SUPER_ADMIN).
 */

/** Safe projection — passwordHash must never appear in any response. */
const SAFE_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

const ROLES = ["SUPER_ADMIN", "MANAGER", "SUPPORT", "CONTENT"] as const;

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(100, "Password is too long")
  .refine(
    (p) => /[A-Za-z]/.test(p) && /[0-9]/.test(p),
    "Password must include at least one letter and one number"
  );

const createSchema = z.object({
  name: z.string().min(2, "Enter the admin's name").max(100),
  email: z.string().email("Enter a valid email"),
  password: passwordSchema,
  role: z.enum(ROLES),
});

/** GET /api/admin/admins — list admin accounts (never passwordHash). */
export const GET = withApi(async () => {
  await requireAdmin();
  const admins = await prisma.adminUser.findMany({
    select: SAFE_SELECT,
    orderBy: { createdAt: "asc" },
  });
  return jsonOk({ admins });
});

/** POST /api/admin/admins — create an admin (SUPER_ADMIN only). */
export const POST = withApi(async (req: NextRequest) => {
  const admin = await requireRole();
  rateLimit(`admin-admins-create:${clientIp(req)}`, 10, 60_000);

  const body = parseBody(createSchema, await req.json().catch(() => ({})));
  const email = body.email.trim().toLowerCase();
  const name = body.name.trim();

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) throw conflict("An admin with that email already exists");

  const passwordHash = await hashPassword(body.password);
  const created = await prisma.adminUser.create({
    data: { name, email, passwordHash, role: body.role, isActive: true },
    select: SAFE_SELECT,
  });

  await audit({
    adminId: admin.id,
    action: "ADMIN_CREATE",
    entityType: "AdminUser",
    entityId: created.id,
    details: { name: created.name, email: created.email, role: created.role },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({ admin: created });
});

export const dynamic = "force-dynamic";
