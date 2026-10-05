import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, rateLimit, clientIp } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { unauthorized, badRequest, notFound } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { recalcRating } from "@/lib/reviews";

const reviewSchema = z.object({
  productId: z.string().min(1),
  rating: z.number().int().min(1, "Pick a star rating").max(5),
  title: z.string().max(100).optional().or(z.literal("")),
  comment: z.string().min(5, "Write at least a few words").max(1000),
});

/** Submit a review (only verified buyers can review after purchase). */
export const POST = withApi(async (req: NextRequest) => {
  rateLimit(`review:${clientIp(req)}`, 6, 300_000);
  const body = parseBody(reviewSchema, await req.json().catch(() => ({})));
  const user = await getSessionUser();
  if (!user) throw unauthorized("Please log in to write a review");

  const product = await prisma.product.findUnique({ where: { id: body.productId } });
  if (!product) throw notFound("Product not found");

  const existing = await prisma.review.findUnique({
    where: { productId_userId: { productId: body.productId, userId: user.id } },
  });
  if (existing) throw badRequest("You have already reviewed this product");

  // Verified purchase = has a non-cancelled order containing this product.
  const purchased = await prisma.orderItem.findFirst({
    where: {
      productId: body.productId,
      order: {
        userId: user.id,
        status: { notIn: ["CANCELLED", "FAILED"] },
      },
    },
  });

  const review = await prisma.review.create({
    data: {
      productId: body.productId,
      userId: user.id,
      rating: body.rating,
      title: body.title || null,
      comment: body.comment,
      isVerified: Boolean(purchased),
      status: "PENDING", // moderated from admin
    },
  });

  await recalcRating(body.productId);

  return jsonOk({ id: review.id, status: review.status, isVerified: review.isVerified });
});

/** Approved reviews for a product. */
export const GET = withApi(
  async (req: NextRequest) => {
    const productId = req.nextUrl.searchParams.get("productId");
    if (!productId) throw badRequest("productId required");

    const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? 1));
    const pageSize = 10;

    const [rows, stats] = await Promise.all([
      prisma.review.findMany({
        where: { productId, status: "APPROVED" },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize + 1,
        include: { user: { select: { name: true } } },
      }),
      prisma.review.aggregate({
        where: { productId, status: "APPROVED" },
        _avg: { rating: true },
        _count: true,
      }),
    ]);

    const hasMore = rows.length > pageSize;
    return jsonOk({
      items: rows.slice(0, pageSize).map((r) => ({
        id: r.id,
        name: r.user.name,
        rating: r.rating,
        title: r.title,
        comment: r.comment,
        isVerified: r.isVerified,
        createdAt: r.createdAt.toISOString(),
      })),
      hasMore,
      page,
      stats: { average: stats._avg.rating ?? 0, count: stats._count },
    });
  },
  { sameOrigin: false }
);

export const dynamic = "force-dynamic";
