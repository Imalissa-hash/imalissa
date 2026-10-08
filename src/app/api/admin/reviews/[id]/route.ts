import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { notFound } from "@/lib/errors";
import { recalcRating } from "@/lib/reviews";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const idFrom = async (ctx?: Ctx): Promise<string> => (await ctx?.params)?.id ?? "";

const patchSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]),
});

// ── PATCH /api/admin/reviews/[id] — approve / hide (audited) ──
export const PATCH = withApi<Ctx>(async (req: NextRequest, ctx?: Ctx) => {
  const admin = await requirePermission("reviews.manage");
  const id = await idFrom(ctx);
  if (!id) throw notFound("Review not found");

  const existing = await prisma.review.findUnique({
    where: { id },
    include: { product: { select: { id: true, name: true } } },
  });
  if (!existing) throw notFound("Review not found");

  const body = parseBody(patchSchema, await req.json().catch(() => ({})));

  if (existing.status !== body.status) {
    await prisma.review.update({ where: { id }, data: { status: body.status } });
    // Product rating/review counts are computed from APPROVED reviews only.
    await recalcRating(existing.productId);

    await audit({
      adminId: admin.id,
      action: "REVIEW_MODERATE",
      entityType: "Review",
      entityId: id,
      details: {
        from: existing.status,
        to: body.status,
        rating: existing.rating,
        product: existing.product.name,
      },
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent"),
    });
  }

  return jsonOk({ id, status: body.status });
});

// ── DELETE /api/admin/reviews/[id] ────────────────────────
// Review has no child rows (product/user cascade *into* it), so deletion is safe.
export const DELETE = withApi<Ctx>(async (req: NextRequest, ctx?: Ctx) => {
  const admin = await requirePermission("reviews.manage");
  const id = await idFrom(ctx);
  if (!id) throw notFound("Review not found");

  const existing = await prisma.review.findUnique({
    where: { id },
    select: { id: true, productId: true, rating: true },
  });
  if (!existing) throw notFound("Review not found");

  await prisma.review.delete({ where: { id } });
  await recalcRating(existing.productId);

  await audit({
    adminId: admin.id,
    action: "REVIEW_DELETE",
    entityType: "Review",
    entityId: id,
    details: { productId: existing.productId, rating: existing.rating },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({ id });
});
