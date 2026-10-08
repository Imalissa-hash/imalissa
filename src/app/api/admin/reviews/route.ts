import { NextRequest } from "next/server";
import type { Prisma, Review } from "@prisma/client";
import { withApi, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { badRequest } from "@/lib/errors";
import type { ReviewRow } from "@/components/admin/content/ReviewsClient";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;

type ReviewWithRefs = Review & {
  product: { id: string; name: string; slug: string };
  user: { name: string };
};

function toRow(r: ReviewWithRefs): ReviewRow {
  return {
    id: r.id,
    rating: r.rating,
    title: r.title,
    comment: r.comment,
    status: r.status,
    isVerified: r.isVerified,
    createdAt: new Date(r.createdAt).toISOString(),
    productId: r.product.id,
    productName: r.product.name,
    productSlug: r.product.slug,
    reviewer: r.user.name,
  };
}

const listInclude = {
  product: { select: { id: true, name: true, slug: true } },
  user: { select: { name: true } },
} satisfies object;

// ── GET /api/admin/reviews — list (q / rating / status / page) ──
export const GET = withApi(async (req: NextRequest) => {
  await requirePermission("reviews.view");

  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").trim();
  const ratingRaw = (sp.get("rating") ?? "").trim();
  const status = sp.get("status") ?? "";
  const requestedPage = Math.max(1, Number(sp.get("page")) || 1);

  let rating: number | undefined;
  if (ratingRaw) {
    const n = Number(ratingRaw);
    if (!Number.isInteger(n) || n < 1 || n > 5) throw badRequest("Invalid rating filter — use 1 to 5");
    rating = n;
  }
  if (status && !STATUSES.includes(status as (typeof STATUSES)[number])) {
    throw badRequest("Invalid status filter");
  }

  const where: Prisma.ReviewWhereInput = {};
  if (q) {
    where.OR = [
      { product: { name: { contains: q } } },
      { user: { name: { contains: q } } },
      { title: { contains: q } },
      { comment: { contains: q } },
    ];
  }
  if (rating !== undefined) where.rating = rating;
  if (status) where.status = status as (typeof STATUSES)[number];

  const total = await prisma.review.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const rows = await prisma.review.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: listInclude,
  });

  return jsonOk({ items: rows.map(toRow), total, totalPages, page });
});
