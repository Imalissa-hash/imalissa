import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { notFound } from "@/lib/errors";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const idFrom = async (ctx?: Ctx): Promise<string> => (await ctx?.params)?.id ?? "";

const patchSchema = z.object({
  action: z.literal("seen"),
});

/**
 * PATCH /api/admin/alerts/[id] — mark a System Log entry as seen.
 * The FIRST admin who presses Seen keeps the credit: seenAt/seenById are
 * only written once, so the "Seen by <name>" stamp never changes later.
 */
export const PATCH = withApi<Ctx>(async (req: NextRequest, ctx?: Ctx) => {
  const admin = await requirePermission("alerts.view");
  const id = await idFrom(ctx);
  if (!id) throw notFound("Alert not found");

  const existing = await prisma.adminAlert.findUnique({
    where: { id },
    select: { id: true, seenAt: true },
  });
  if (!existing) throw notFound("Alert not found");

  if (!existing.seenAt) {
    await prisma.adminAlert.update({
      where: { id },
      data: { seenAt: new Date(), seenById: admin.id },
    });
  }

  const row = await prisma.adminAlert.findUnique({
    where: { id },
    select: { seenAt: true, seenBy: { select: { name: true } } },
  });

  return jsonOk({
    id,
    seenAt: row?.seenAt?.toISOString() ?? null,
    seenByName: row?.seenBy?.name ?? null,
  });
});
