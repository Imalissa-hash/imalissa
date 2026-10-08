import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { badRequest } from "@/lib/errors";

export const dynamic = "force-dynamic";

const reorderSchema = z.object({
  orderedIds: z.array(z.string().trim().min(1).max(64)).min(1, "orderedIds: Send the full ordered list").max(1000),
});

// ── POST /api/admin/homepage/sections/reorder — bulk reorder ──
// Body: { orderedIds: string[] } — the complete list of section ids in their
// new visual order. `order` is rewritten to the array index (storefront sorts
// ascending), so the payload must be a permutation of every section id.
export const POST = withApi(async (req: NextRequest) => {
  const admin = await requirePermission("homepage.manage");
  const body = parseBody(reorderSchema, await req.json().catch(() => ({})));
  const ids = body.orderedIds;

  if (new Set(ids).size !== ids.length) {
    throw badRequest("orderedIds: Duplicate ids — send each section exactly once");
  }

  const rows = await prisma.homeSection.findMany({ select: { id: true, key: true } });
  const keyById = new Map(rows.map((r) => [r.id, r.key]));
  for (const id of ids) {
    if (!keyById.has(id)) throw badRequest(`orderedIds: Unknown section "${id}"`);
  }
  if (ids.length !== rows.length) {
    throw badRequest(
      `orderedIds: Expected all ${rows.length} section id(s), received ${ids.length}`
    );
  }

  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.homeSection.update({ where: { id }, data: { order: index } })
    )
  );

  await audit({
    adminId: admin.id,
    action: "HOME_SECTION_REORDER",
    entityType: "HomeSection",
    details: { count: ids.length, order: ids.map((id) => keyById.get(id)) },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({ count: ids.length });
});
