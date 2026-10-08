import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { badRequest } from "@/lib/errors";
import {
  PERMISSIONS,
  PERMISSION_KEYS,
  DEFAULT_GRANTS,
  grantableKeys,
} from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * GET/PUT /api/admin/roles — the Roles & Permissions matrix.
 *
 * SUPER_ADMIN only (requireRole() with no role args). RolePermission rows
 * can NEVER widen this: permission management itself is not a grantable
 * permission, so a non-super admin cannot hand themselves the keys.
 *
 *  GET  ?role=MANAGER|SUPPORT|CONTENT → catalog + effective grants
 *       (built-in defaults until the role has been configured once)
 *  PUT  { role, granted: string[] }  → writes the FULL matrix for that
 *       role (granted true/false per key) so "revoked" differs from
 *       "never configured"
 */

const EDITABLE_ROLES = ["MANAGER", "SUPPORT", "CONTENT"] as const;

const querySchema = z.object({
  role: z.enum(EDITABLE_ROLES).default("MANAGER"),
});

const putSchema = z.object({
  role: z.enum(EDITABLE_ROLES),
  granted: z.array(z.string().trim().min(1).max(80)).max(300),
});

export const GET = withApi(async (req: NextRequest) => {
  await requireRole();

  const sp = req.nextUrl.searchParams;
  const { role } = parseBody(querySchema, { role: sp.get("role") ?? undefined });

  const rows = await prisma.rolePermission.findMany({ where: { role } });
  const configured = rows.length > 0;
  const granted = configured
    ? rows.filter((r) => r.granted).map((r) => r.permission)
    : (DEFAULT_GRANTS[role] ?? []);

  return jsonOk({
    role,
    configured,
    granted: granted.filter((k) => PERMISSION_KEYS.has(k)),
    defaults: DEFAULT_GRANTS[role] ?? [],
    permissions: PERMISSIONS,
  });
});

export const PUT = withApi(async (req: NextRequest) => {
  const admin = await requireRole();
  const body = parseBody(putSchema, await req.json().catch(() => ({})));

  const allowed = new Set(grantableKeys());
  const invalid = body.granted.filter((k) => !allowed.has(k));
  if (invalid.length > 0) {
    throw badRequest(`Unknown permission${invalid.length > 1 ? "s" : ""}: ${invalid.slice(0, 3).join(", ")}`);
  }

  const grantedSet = new Set(body.granted);

  // Full matrix for the role: every grantable key with an explicit value.
  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { role: body.role } }),
    prisma.rolePermission.createMany({
      data: grantableKeys().map((key) => ({
        role: body.role,
        permission: key,
        granted: grantedSet.has(key),
      })),
    }),
  ]);

  await audit({
    adminId: admin.id,
    action: "ROLE_PERMISSIONS_UPDATE",
    entityType: "RolePermission",
    entityId: body.role,
    details: { grantedCount: grantedSet.size, total: grantableKeys().length },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({
    role: body.role,
    configured: true,
    grantedCount: grantedSet.size,
  });
});
