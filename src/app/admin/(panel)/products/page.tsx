import type { Metadata } from "next";
import Link from "next/link";
import { Download, Plus } from "lucide-react";
import type { Prisma, ProductStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { salePrice } from "@/lib/utils";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { ProductsClient } from "@/components/admin/catalog/ProductsClient";
import type { ProductFacets, ProductRow } from "@/components/admin/catalog/ProductsClient";

import { pageGuard } from "@/components/admin/AccessDenied";
export const metadata: Metadata = {
  title: "Products",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 20;
const STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"];
const SORTS = ["newest", "price_asc", "price_desc", "name", "stock"];

const listInclude = {
  images: { orderBy: { position: "asc" as const }, take: 1 },
  category: { select: { name: true } },
  brand: { select: { name: true } },
} satisfies object;

interface ListProduct {
  id: string;
  name: string;
  slug: string;
  sku: string;
  price: unknown;
  compareAtPrice: unknown;
  discountPercent: number;
  stock: number;
  lowStockThreshold: number;
  status: string;
  isFeatured: boolean;
  isBestseller: boolean;
  newArrival: boolean;
  isDeal: boolean;
  images: { url: string }[];
  category: { name: string };
  brand: { name: string } | null;
}

function toRow(p: ListProduct): ProductRow {
  const price = Number(p.price);
  const compareAt = p.compareAtPrice != null ? Number(p.compareAtPrice) : null;
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    sku: p.sku,
    price,
    compareAtPrice: compareAt,
    discountPercent: p.discountPercent,
    salePrice: salePrice(price, p.discountPercent),
    stock: p.stock,
    lowStockThreshold: p.lowStockThreshold,
    status: p.status,
    isFeatured: p.isFeatured,
    isBestseller: p.isBestseller,
    newArrival: p.newArrival,
    isDeal: p.isDeal,
    image: p.images[0]?.url ?? null,
    categoryName: p.category.name,
    brandName: p.brand?.name ?? null,
  };
}

const isLow = (p: { stock: number; lowStockThreshold: number }) =>
  p.stock > 0 && p.stock <= p.lowStockThreshold;
const isOut = (p: { stock: number }) => p.stock <= 0;

/** Admin product list — server-rendered from searchParams. */
export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const denied = await pageGuard("products.view");
  if (denied) return denied;

  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v : "";
  };

  const q = one("q").trim();
  const status = STATUSES.includes(one("status")) ? one("status") : "";
  const categoryId = one("categoryId");
  const brandId = one("brandId");
  const stock = one("stock") === "low" || one("stock") === "out" ? one("stock") : "";
  const sort = SORTS.includes(one("sort")) ? one("sort") : "newest";
  const requestedPage = Math.max(1, Number(one("page")) || 1);

  const baseWhere: Prisma.ProductWhereInput = {};
  if (q) baseWhere.OR = [{ name: { contains: q } }, { sku: { contains: q } }];
  if (status) baseWhere.status = status as ProductStatus;
  const facetWhere: Prisma.ProductWhereInput = { ...baseWhere };
  if (categoryId) baseWhere.categoryId = categoryId;
  if (brandId) baseWhere.brandId = brandId;

  const orderBy: Prisma.ProductOrderByWithRelationInput =
    sort === "price_asc"
      ? { price: "asc" }
      : sort === "price_desc"
        ? { price: "desc" }
        : sort === "name"
          ? { name: "asc" }
          : sort === "stock"
            ? { stock: "asc" }
            : { createdAt: "desc" };

  const [rows, catCounts, categories, brands] = await Promise.all([
    prisma.product.findMany({ where: baseWhere, orderBy, include: listInclude }),
    prisma.product.groupBy({ by: ["categoryId"], where: facetWhere, _count: { _all: true } }),
    prisma.category.findMany({
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const filtered =
    stock === "low" ? rows.filter(isLow) : stock === "out" ? rows.filter(isOut) : rows;
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const items = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(toRow);

  const countByCategory = new Map(catCounts.map((g) => [g.categoryId, g._count._all]));
  const facets: ProductFacets = {
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      count: countByCategory.get(c.id) ?? 0,
    })),
    brands,
  };

  return (
    <div>
      <AdminPageHeader
        title="Products"
        subtitle={`${total.toLocaleString()} product${total === 1 ? "" : "s"} in this view`}
        action={
          <div className="flex items-center gap-3">
            <Link
              href="/admin/import"
              className="flex items-center gap-2 rounded-xl border border-white/12 px-4 py-2.5 text-[0.84rem] font-semibold text-mist-300 transition hover:border-gold-500/40 hover:text-gold-300"
            >
              <Download size={15} /> Import from partner
            </Link>
            <Link
              href="/admin/products/new"
              className="btn-gold flex items-center gap-2 rounded-xl px-4 py-2.5 text-[0.84rem]"
            >
              <Plus size={15} /> Add product
            </Link>
          </div>
        }
      />
      <ProductsClient
        items={items}
        total={total}
        totalPages={totalPages}
        page={page}
        facets={facets}
        searchParams={sp}
      />
    </div>
  );
}
