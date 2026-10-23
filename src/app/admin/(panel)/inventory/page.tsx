import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { variantLabel } from "@/lib/utils";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { InventoryClient } from "@/components/admin/catalog/InventoryClient";
import type {
  CategoryChoice,
  InventoryCounts,
  InventoryRow,
  ReorderItem,
} from "@/components/admin/catalog/InventoryClient";

import { pageGuard } from "@/components/admin/AccessDenied";
export const metadata: Metadata = {
  title: "Inventory",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 20;
/** The reorder list is a shopping aid, not an export — cap it so a large
 *  catalogue cannot render an unbounded modal. Surplus is stated honestly. */
const REORDER_CAP = 100;

const isLow = (p: { stock: number; lowStockThreshold: number }) =>
  p.stock > 0 && p.stock <= p.lowStockThreshold;
const isOut = (p: { stock: number }) => p.stock <= 0;

/** Admin inventory page — stock vs threshold with expandable variants. */
export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const denied = await pageGuard("inventory.view");
  if (denied) return denied;

  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v : "";
  };

  const q = one("q").trim();
  const stock = one("stock") === "low" || one("stock") === "out" ? one("stock") : "";
  const requestedPage = Math.max(1, Number(one("page")) || 1);

  const where = q ? { OR: [{ name: { contains: q } }, { sku: { contains: q } }] } : {};
  const [rows, categories] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ stock: "asc" }, { name: "asc" }],
      include: {
        images: { orderBy: { position: "asc" }, take: 1 },
        variants: { orderBy: { position: "asc" } },
      },
    }),
    // The quick-add modal needs a category — the product API requires one.
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const counts: InventoryCounts = {
    all: rows.length,
    low: rows.filter(isLow).length,
    out: rows.filter(isOut).length,
  };

  // Reorder list — derived from the full result set already loaded above,
  // so it is not limited to the 20 rows on this page. Out-of-stock sorts
  // first, then the thinnest stock relative to its threshold.
  const allReorder: ReorderItem[] = rows
    .filter((p) => isLow(p) || isOut(p))
    .sort((a, b) => {
      const aOut = isOut(a) ? 0 : 1;
      const bOut = isOut(b) ? 0 : 1;
      if (aOut !== bOut) return aOut - bOut;
      return a.stock / Math.max(1, a.lowStockThreshold) - b.stock / Math.max(1, b.lowStockThreshold);
    })
    .map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      stock: p.stock,
      lowStockThreshold: p.lowStockThreshold,
      variantCount: p.variants.length,
      state: isOut(p) ? ("OUT" as const) : ("LOW" as const),
    }));
  const reorderItems = allReorder.slice(0, REORDER_CAP);
  const reorderOverflow = Math.max(0, allReorder.length - reorderItems.length);
  const categoryChoices: CategoryChoice[] = categories;

  const filtered = stock === "low" ? rows.filter(isLow) : stock === "out" ? rows.filter(isOut) : rows;
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const items: InventoryRow[] = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    status: p.status,
    stock: p.stock,
    lowStockThreshold: p.lowStockThreshold,
    image: p.images[0]?.url ?? null,
    variantCount: p.variants.length,
    variants: p.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      color: v.color,
      size: v.size,
      label: variantLabel(v.color, v.size),
      stock: v.stock,
      price: v.price != null ? Number(v.price) : null,
    })),
  }));

  return (
    <div>
      <AdminPageHeader
        title="Inventory"
        subtitle={`${counts.out} out of stock · ${counts.low} low · ${counts.all} products tracked`}
      />
      <InventoryClient
        items={items}
        total={total}
        totalPages={totalPages}
        page={page}
        counts={counts}
        searchParams={sp}
        categories={categoryChoices}
        reorderItems={reorderItems}
        reorderOverflow={reorderOverflow}
      />
    </div>
  );
}
