import { prisma } from "./db";

/** Append an admin audit entry (never throws — audit must not break actions). */
export async function audit(params: {
  adminId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        adminId: params.adminId ?? null,
        action: params.action,
        entityType: params.entityType ?? null,
        entityId: params.entityId ?? null,
        details: (params.details as object) ?? undefined,
        ip: params.ip ?? null,
        userAgent: params.userAgent?.slice(0, 255) ?? null,
      },
    });
  } catch (err) {
    console.error("[audit] failed to write log:", err);
  }
}
