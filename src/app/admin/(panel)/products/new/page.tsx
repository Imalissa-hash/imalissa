import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { BackLink } from "@/components/admin/AdminShell";
import { ProductForm, type CategoryOption, type Option } from "@/components/admin/catalog/ProductForm";

import { pageGuard } from "@/components/admin/AccessDenied";
export const metadata: Metadata = {
  title: "New product",
  robots: { index: false, follow: false },
};

async function loadData() {
  const [brands, categories] = await Promise.all([
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.category.findMany({
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: { id: true, name: true, parentId: true },
    }),
  ]);

  // Flatten the tree (depth = indentation in the select).
  const byParent = new Map<string | null, typeof categories>();
  for (const c of categories) {
    const list = byParent.get(c.parentId) ?? [];
    list.push(c);
    byParent.set(c.parentId, list);
  }
  const out: CategoryOption[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const c of byParent.get(parentId) ?? []) {
      out.push({ id: c.id, name: c.name, depth });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);

  return { brands: brands as Option[], categories: out };
}

/** Create-product page. */
export default async function NewProductPage() {
  const denied = await pageGuard("products.view");
  if (denied) return denied;

  const { brands, categories } = await loadData();

  return (
    <div>
      <BackLink href="/admin/products" label="Back to products" />
      <ProductForm mode="create" brands={brands} categories={categories} />
    </div>
  );
}
