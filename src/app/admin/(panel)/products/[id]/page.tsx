import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { parseJsonArray } from "@/lib/queries";
import { BackLink } from "@/components/admin/AdminShell";
import {
  ProductForm,
  type CategoryOption,
  type InitialProduct,
  type Option,
} from "@/components/admin/catalog/ProductForm";

export const metadata: Metadata = {
  title: "Edit product",
  robots: { index: false, follow: false },
};

async function loadOptions() {
  const [brands, categories] = await Promise.all([
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.category.findMany({
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: { id: true, name: true, parentId: true },
    }),
  ]);

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

/** Edit-product page (params is a Promise in Next 15). */
export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [product, { brands, categories }] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: {
        images: { orderBy: { position: "asc" } },
        variants: { orderBy: { position: "asc" } },
      },
    }),
    loadOptions(),
  ]);

  if (!product) notFound();

  const initial: InitialProduct = {
    id: product.id,
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    brandId: product.brandId,
    categoryId: product.categoryId,
    price: Number(product.price),
    compareAtPrice: product.compareAtPrice != null ? Number(product.compareAtPrice) : null,
    discountPercent: product.discountPercent,
    stock: product.stock,
    lowStockThreshold: product.lowStockThreshold,
    status: product.status,
    isFeatured: product.isFeatured,
    isBestseller: product.isBestseller,
    newArrival: product.newArrival,
    isDeal: product.isDeal,
    shortDescription: product.shortDescription,
    description: product.description,
    colors: parseJsonArray(product.colors),
    sizes: parseJsonArray(product.sizes),
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    images: product.images.map((i) => ({ id: i.id, url: i.url, alt: i.alt })),
    variants: product.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      color: v.color ?? "",
      size: v.size ?? "",
      price: v.price != null ? String(Number(v.price)) : "",
      stock: String(v.stock),
    })),
  };

  return (
    <div>
      <BackLink href="/admin/products" label="Back to products" />
      <ProductForm mode="edit" initial={initial} brands={brands} categories={categories} />
    </div>
  );
}
