import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withApi, jsonOk, parseBody } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import type { CustomerRow } from "@/components/admin/sales/CustomersClient";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/customers — customer list.
 * Filters: q (name / email / phone), status (ACTIVE | BLOCKED), page.
 * Never returns password material.
 */

const PAGE_SIZE = 20;

const querySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["ACTIVE", "BLOCKED"]).optional(),
  page: z.coerce.number().int().min(1).max(100000).optional(),
});

export const GET = withApi(async (req: NextRequest) => {
  await requirePermission("customers.view");

  const sp = req.nextUrl.searchParams;
  const query = parseBody(querySchema, {
    q: sp.get("q") ?? undefined,
    status: sp.get("status") ?? undefined,
    page: sp.get("page") ?? undefined,
  });
  const page = query.page ?? 1;

  const where: Prisma.UserWhereInput = {};
  if (query.q) {
    where.OR = [
      { name: { contains: query.q } },
      { email: { contains: query.q } },
      { phone: { contains: query.q } },
    ];
  }
  if (query.status) where.status = query.status;

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
        _count: { select: { orders: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  // One aggregate for the whole page (no N+1).
  const ids = rows.map((r) => r.id);
  const spendGroups = ids.length
    ? await prisma.order.groupBy({
        by: ["userId"],
        where: { userId: { in: ids }, status: { notIn: ["CANCELLED", "FAILED", "RETURNED"] }, deletedAt: null },
        _sum: { total: true },
      })
    : [];
  const spendByUser = new Map(
    spendGroups.map((g) => [g.userId, Number(g._sum.total ?? 0)])
  );

  const items: CustomerRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    status: r.status,
    ordersCount: r._count.orders,
    totalSpent: spendByUser.get(r.id) ?? 0,
    createdAt: r.createdAt.toISOString(),
  }));

  return jsonOk({
    items,
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
});
