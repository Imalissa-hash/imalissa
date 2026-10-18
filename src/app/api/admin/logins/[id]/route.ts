import { NextRequest } from "next/server";
import { withApi, jsonOk, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { notFound } from "@/lib/errors";
import { evictSessionCache } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const idFrom = async (ctx?: Ctx): Promise<string> => (await ctx?.params)?.id ?? "";

/**
 * DELETE /api/admin/logins/[id] — sign a customer out everywhere.
 *
 * This ends their sessions ONLY: the account, orders, addresses, reviews and
 * chat history all stay exactly as they are. It is "log them out", never
 * "delete them" — destroying a customer who has ordered would destroy order
 * history that the supplier has already been paid against, so the two must
 * not share a button.
 *
 * Two things have to happen together or the logout is a lie:
 *   1. the Session rows go (so the cookie they hold no longer resolves), and
 *   2. the in-memory session cache is evicted by the same token hashes —
 *      getSessionUser answers from that cache before touching the database,
 *      so without step 2 this instance would keep honouring their cookie for
 *      up to 30 s after we claimed they were signed out.
 */
export const DELETE = withApi<Ctx>(async (req: NextRequest, ctx?: Ctx) => {
  const admin = await requirePermission("customers.manage");
  const id = await idFrom(ctx);
  if (!id) throw notFound("Account not found");

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, phone: true },
  });
  if (!user) throw notFound("Account not found");

  // Read the hashes BEFORE deleting — deleteMany returns no rows back.
  const sessions = await prisma.session.findMany({
    where: { userId: id },
    select: { tokenHash: true },
  });

  if (sessions.length > 0) {
    await prisma.session.deleteMany({ where: { userId: id } });
    evictSessionCache(sessions.map((s) => s.tokenHash));
  }

  await audit({
    adminId: admin.id,
    action: "CUSTOMER_FORCE_LOGOUT",
    entityType: "User",
    entityId: id,
    details: {
      name: user.name,
      email: user.email,
      phone: user.phone,
      sessionsEnded: sessions.length,
    },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({ id, sessionsEnded: sessions.length, name: user.name });
});
