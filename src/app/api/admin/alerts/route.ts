import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/alerts — the admin System Log (new orders + new
 * contact messages). Returns the newest entries plus the unseen count
 * that feeds the topbar bell badge.
 *
 * Query: page (default 1), size (default 20, max 50), type filter.
 */

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).optional(),
  size: z.coerce.number().int().min(1).max(50).optional(),
  type: z.enum(["ORDER", "MESSAGE"]).optional(),
});

const DEFAULT_SIZE = 20;

export const GET = withApi(async (req: NextRequest) => {
  await requirePermission("alerts.view");

  const sp = req.nextUrl.searchParams;
  const query = parseBody(querySchema, {
    page: sp.get("page") ?? undefined,
    size: sp.get("size") ?? undefined,
    type: sp.get("type") ?? undefined,
  });
  const page = query.page ?? 1;
  const size = query.size ?? DEFAULT_SIZE;

  const where = query.type ? { type: query.type } : undefined;

  const [rows, total, unseen] = await Promise.all([
    prisma.adminAlert.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * size,
      take: size,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        link: true,
        seenAt: true,
        createdAt: true,
        seenBy: { select: { name: true } },
      },
    }),
    prisma.adminAlert.count({ where }),
    prisma.adminAlert.count({ where: { seenAt: null } }),
  ]);

  const items = rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    seenAt: row.seenAt?.toISOString() ?? null,
    seenByName: row.seenBy?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  }));

  return jsonOk({
    items,
    total,
    unseen,
    page,
    pageSize: size,
    totalPages: Math.max(1, Math.ceil(total / size)),
  });
});
