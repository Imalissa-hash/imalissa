import type { Metadata } from "next";
import type { Prisma, Review } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { ReviewsClient } from "@/components/admin/content/ReviewsClient";
import type { ReviewRow } from "@/components/admin/content/ReviewsClient";

import { pageGuard } from "@/components/admin/AccessDenied";
export const metadata: Metadata = {
  title: "Reviews",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const STATUSES = ["PENDING", "APPROVED", "REJECTED"];

type ReviewWithRefs = Review & {
  product: { id: string; name: string; slug: string };
  user: { name: string };
};

const listInclude = {
  product: { select: { id: true, name: true, slug: true } },
  user: { select: { name: true } },
} satisfies object;

/** Serialize a review row (Date → ISO). */
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

/** Admin review moderation — server-rendered from searchParams. */
export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const denied = await pageGuard("reviews.view");
  if (denied) return denied;

  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v : "";
  };

  const q = one("q").trim();
  const ratingRaw = Number(one("rating"));
  const rating =
    one("rating") && Number.isInteger(ratingRaw) && ratingRaw >= 1 && ratingRaw <= 5
      ? ratingRaw
      : null;
  const status = STATUSES.includes(one("status")) ? one("status") : "";
  const requestedPage = Math.max(1, Number(one("page")) || 1);

  const where: Prisma.ReviewWhereInput = {};
  if (q) {
    where.OR = [
      { product: { name: { contains: q } } },
      { user: { name: { contains: q } } },
      { title: { contains: q } },
      { comment: { contains: q } },
    ];
  }
  if (rating !== null) where.rating = rating;
  if (status) where.status = status as "PENDING" | "APPROVED" | "REJECTED";

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

  return (
    <div>
      <AdminPageHeader
        title="Reviews"
        subtitle={`${total.toLocaleString()} review${total === 1 ? "" : "s"} in this view — approve to publish, hide to remove`}
      />
      <ReviewsClient
        items={rows.map(toRow)}
        total={total}
        totalPages={totalPages}
        page={page}
        searchParams={sp}
      />
    </div>
  );
}
