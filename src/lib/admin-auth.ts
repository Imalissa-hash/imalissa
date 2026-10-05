import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { sha256 } from "./auth";
import { forbidden, unauthorized } from "./errors";
import { cookieSecure } from "./utils";

/**
 * Admin authentication — separate cookie + separate session table from
 * customer accounts, so a customer session can never reach /admin APIs.
 */

export const ADMIN_COOKIE = "imalissa_admin";
export const ADMIN_SESSION_DAYS = 12;

export interface AdminIdentity {
  id: string;
  email: string;
  name: string;
  role: string;
}

export async function startAdminSession(
  adminId: string,
  ip?: string,
  userAgent?: string
): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.adminSession.create({
    data: {
      tokenHash: sha256(token),
      adminId,
      ip: ip ?? null,
      userAgent: userAgent?.slice(0, 255) ?? null,
      expiresAt,
    },
  });

  const store = await cookies();
  store.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(), // HTTPS-only; NODE_ENV-gating broke HTTP deployments
    path: "/",
    expires: expiresAt,
  });
}

export async function destroyAdminSession(): Promise<void> {
  try {
    const store = await cookies();
    const token = store.get(ADMIN_COOKIE)?.value;
    if (token) await prisma.adminSession.deleteMany({ where: { tokenHash: sha256(token) } });
  } catch {
    // best effort
  }
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}

/** Resolve the logged-in admin (or null). */
export async function getAdmin(): Promise<AdminIdentity | null> {
  try {
    const store = await cookies();
    const token = store.get(ADMIN_COOKIE)?.value;
    if (!token) return null;

    const session = await prisma.adminSession.findUnique({
      where: { tokenHash: sha256(token) },
      include: { admin: true },
    });

    if (!session || session.expiresAt < new Date()) return null;
    if (!session.admin.isActive) return null;

    return {
      id: session.admin.id,
      email: session.admin.email,
      name: session.admin.name,
      role: session.admin.role,
    };
  } catch (err) {
    console.error("[admin-auth] session lookup failed:", err);
    return null;
  }
}

/** Require a logged-in admin or throw ApiError(401). */
export async function requireAdmin(): Promise<AdminIdentity> {
  const admin = await getAdmin();
  if (!admin) throw unauthorized("Admin login required");
  return admin;
}

/** Require one of the given roles or throw ApiError(403). */
export async function requireRole(...roles: string[]): Promise<AdminIdentity> {
  const admin = await requireAdmin();
  if (admin.role !== "SUPER_ADMIN" && !roles.includes(admin.role)) {
    throw forbidden("Your admin role does not allow this action");
  }
  return admin;
}

export function isAdminCookieName(name: string): boolean {
  return name === ADMIN_COOKIE;
}
