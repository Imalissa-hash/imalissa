import { NextRequest } from "next/server";
import { z } from "zod";
import type { AdminRole } from "@prisma/client";
import { withApi, jsonOk, parseBody, rateLimit, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/admin-auth";
import { hashPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { badRequest, conflict, notFound } from "@/lib/errors";

/**
 * Single admin account API — SUPER_ADMIN only (requireRole() with NO
 * role args passes only for SUPER_ADMIN) + audit on every mutation.
 *
 * Guard rules (server-side, never trusted from the client):
 *  - You cannot deactivate or demote YOURSELF.
 *  - You cannot deactivate/demote/delete the LAST active SUPER_ADMIN
 *    (409 with an honest message).
 *  - DELETE keeps AuditLog rows: the schema declares
 *    AuditLog.adminId @relation(onDelete: SetNull), so existing log rows
 *    survive the delete with admin attribution cleared, and this route
 *    records a name/email/role snapshot in the ADMIN_DELETE entry so the
 *    deletion itself stays attributable. AdminSession rows cascade, so
 *    the deleted admin's sessions are revoked immediately.
 */

interface RouteCtx {
  params: Promise<{ id: string }>;
}

const ROLES = ["SUPER_ADMIN", "MANAGER", "SUPPORT", "CONTENT"] as const;

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(100, "Password is too long")
  .refine(
    (p) => /[A-Za-z]/.test(p) && /[0-9]/.test(p),
    "Password must include at least one letter and one number"
  );

const updateSchema = z
  .object({
    name: z
      .string()
      .max(100, "Name is too long")
      .refine((s) => s.trim().length >= 2, "Enter the admin's name")
      .optional(),
    role: z.enum(ROLES).optional(),
    isActive: z.boolean().optional(),
    password: passwordSchema.optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.role !== undefined ||
      v.isActive !== undefined ||
      v.password !== undefined,
    "Nothing to update"
  );

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

type UpdateData = {
  name?: string;
  role?: AdminRole;
  isActive?: boolean;
  passwordHash?: string;
};

/** PATCH /api/admin/admins/[id] — rename / change role / toggle / reset password. */
export const PATCH = withApi<RouteCtx>(async (req, ctx) => {
  const { id } = await ctx!.params;
  const me = await requireRole();
  rateLimit(`admin-admins:${clientIp(req)}`, 30, 60_000);

  const body = parseBody(updateSchema, await req.json().catch(() => ({})));

  const target = await prisma.adminUser.findUnique({ where: { id } });
  if (!target) throw notFound("Admin account not found");

  const demoting = body.role !== undefined && body.role !== target.role && body.role !== "SUPER_ADMIN";
  const deactivating = body.isActive === false && target.isActive;
  const losesActiveSuper =
    target.role === "SUPER_ADMIN" && target.isActive && (demoting || deactivating);

  if (losesActiveSuper && target.id === me.id) {
    throw badRequest(
      demoting && deactivating
        ? "You cannot demote and deactivate your own account"
        : demoting
          ? "You cannot demote your own account"
          : "You cannot deactivate your own account"
    );
  }

  if (losesActiveSuper) {
    const otherActiveSupers = await prisma.adminUser.count({
      where: { role: "SUPER_ADMIN", isActive: true, id: { not: target.id } },
    });
    if (otherActiveSupers === 0) {
      throw conflict(
        "This is the last active Super Admin account — promote another account to Super Admin first"
      );
    }
  }

  const data: UpdateData = {};
  const changed: string[] = [];
  if (body.name !== undefined && body.name.trim() !== target.name) {
    data.name = body.name.trim();
    changed.push("name");
  }
  if (body.role !== undefined && body.role !== target.role) {
    data.role = body.role;
    changed.push("role");
  }
  if (body.isActive !== undefined && body.isActive !== target.isActive) {
    data.isActive = body.isActive;
    changed.push(body.isActive ? "activated" : "deactivated");
  }
  let passwordReset = false;
  if (body.password !== undefined) {
    data.passwordHash = await hashPassword(body.password);
    passwordReset = true;
    changed.push("password reset");
  }

  if (changed.length === 0) {
    return jsonOk({ admin: await prisma.adminUser.findUnique({ where: { id }, select: SAFE_SELECT }) });
  }

  const updated = await prisma.adminUser.update({
    where: { id: target.id },
    data,
    select: SAFE_SELECT,
  });

  await audit({
    adminId: me.id,
    action: "ADMIN_UPDATE",
    entityType: "AdminUser",
    entityId: target.id,
    details: {
      changed,
      email: target.email,
      ...(passwordReset ? { passwordReset: true } : {}),
    },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({ admin: updated });
});

/** DELETE /api/admin/admins/[id] — remove an admin (audit rows survive). */
export const DELETE = withApi<RouteCtx>(async (req, ctx) => {
  const { id } = await ctx!.params;
  const me = await requireRole();
  rateLimit(`admin-admins:${clientIp(req)}`, 20, 60_000);

  if (id === me.id) throw badRequest("You cannot delete your own account");

  const target = await prisma.adminUser.findUnique({ where: { id } });
  if (!target) throw notFound("Admin account not found");

  if (target.role === "SUPER_ADMIN" && target.isActive) {
    const otherActiveSupers = await prisma.adminUser.count({
      where: { role: "SUPER_ADMIN", isActive: true, id: { not: target.id } },
    });
    if (otherActiveSupers === 0) {
      throw conflict(
        "This is the last active Super Admin account — promote another account to Super Admin first"
      );
    }
  }

  // AuditLog.adminId is onDelete: SetNull (see schema), so log rows are
  // kept and only lose their admin link; sessions cascade away.
  await prisma.adminUser.delete({ where: { id: target.id } });

  await audit({
    adminId: me.id,
    action: "ADMIN_DELETE",
    entityType: "AdminUser",
    entityId: target.id,
    details: {
      name: target.name,
      email: target.email,
      role: target.role,
      wasActive: target.isActive,
    },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({ id: target.id });
});

export const dynamic = "force-dynamic";
