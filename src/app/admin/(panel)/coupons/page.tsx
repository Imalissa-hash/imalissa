import type { Metadata } from "next";
import type { Coupon, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { CouponsClient } from "@/components/admin/content/CouponsClient";
import type { CouponRow } from "@/components/admin/content/CouponsClient";

export const metadata: Metadata = {
  title: "Coupons",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

/** Serialize a coupon row (Decimal → number, Date → ISO). */
function toRow(c: Coupon): CouponRow {
  return {
    id: c.id,
    code: c.code,
    type: c.type,
    value: Number(c.value),
    minOrder: Number(c.minOrder),
    maxDiscount: c.maxDiscount != null ? Number(c.maxDiscount) : null,
    startsAt: c.startsAt ? new Date(c.startsAt).toISOString() : null,
    expiresAt: c.expiresAt ? new Date(c.expiresAt).toISOString() : null,
    usageLimit: c.usageLimit,
    usedCount: c.usedCount,
    perUserLimit: c.perUserLimit,
    isActive: c.isActive,
    description: c.description,
    createdAt: new Date(c.createdAt).toISOString(),
  };
}

/** Admin coupons list — server-rendered from searchParams. */
export default async function AdminCouponsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v : "";
  };

  const q = one("q").trim();
  const activeRaw = one("active").trim().toLowerCase();
  const active =
    activeRaw === "1" || activeRaw === "true"
      ? true
      : activeRaw === "0" || activeRaw === "false"
        ? false
        : null;
  const requestedPage = Math.max(1, Number(one("page")) || 1);

  const where: Prisma.CouponWhereInput = {};
  if (q) where.OR = [{ code: { contains: q } }, { description: { contains: q } }];
  if (active !== null) where.isActive = active;

  const total = await prisma.coupon.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const rows = await prisma.coupon.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  return (
    <div>
      <AdminPageHeader
        title="Coupons"
        subtitle={`${total.toLocaleString()} coupon code${total === 1 ? "" : "s"} in this view`}
      />
      <CouponsClient
        items={rows.map(toRow)}
        total={total}
        totalPages={totalPages}
        page={page}
        searchParams={sp}
      />
    </div>
  );
}
