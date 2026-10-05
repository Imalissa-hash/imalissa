import { NextRequest } from "next/server";
import { withApi, jsonOk } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { unauthorized, notFound } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { recalcRating } from "@/lib/reviews";

/** GET → the current customer's reviews (any moderation status). */
export const GET = withApi(async () => {
  const user = await getSessionUser();
  if (!user) throw unauthorized();

  const reviews = await prisma.review.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      product: { select: { name: true, slug: true, images: { take: 1, orderBy: { position: "asc" } } } },
    },
  });

  return jsonOk(
    reviews.map((r) => ({
      id: r.id,
      productId: r.productId,
      productName: r.product.name,
      productSlug: r.product.slug,
      productImage: r.product.images[0]?.url ?? null,
      rating: r.rating,
      title: r.title,
      comment: r.comment,
      status: r.status,
      isVerified: r.isVerified,
      createdAt: r.createdAt.toISOString(),
    }))
  );
});

/** DELETE ?id=… → withdraw your own review. */
export const DELETE = withApi(async (req: NextRequest) => {
  const user = await getSessionUser();
  if (!user) throw unauthorized();

  const id = req.nextUrl.searchParams.get("id");
  if (!id) throw notFound("Review id required");

  const review = await prisma.review.findFirst({ where: { id, userId: user.id } });
  if (!review) throw notFound("Review not found");

  await prisma.review.delete({ where: { id } });
  await recalcRating(review.productId);

  return jsonOk({ deleted: true });
});

export const dynamic = "force-dynamic";
