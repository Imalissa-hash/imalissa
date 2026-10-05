import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { CategoriesClient } from "@/components/admin/catalog/CategoriesClient";
import type { CategoryTreeNode } from "@/components/admin/catalog/CategoriesClient";

export const metadata: Metadata = {
  title: "Categories",
  robots: { index: false, follow: false },
};

/** Admin categories page — tree with product counts, server-rendered. */
export default async function AdminCategoriesPage() {
  const rows = await prisma.category.findMany({
    orderBy: [{ position: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: true, children: true } } },
  });

  const nodes = new Map<string, CategoryTreeNode>();
  for (const r of rows) {
    nodes.set(r.id, {
      id: r.id,
      name: r.name,
      slug: r.slug,
      parentId: r.parentId,
      description: r.description,
      image: r.image,
      icon: r.icon,
      isActive: r.isActive,
      position: r.position,
      showInMenu: r.showInMenu,
      productCount: r._count.products,
      children: [],
    });
  }

  const roots: CategoryTreeNode[] = [];
  for (const r of rows) {
    const node = nodes.get(r.id)!;
    if (r.parentId && nodes.has(r.parentId)) nodes.get(r.parentId)!.children.push(node);
    else roots.push(node);
  }

  return (
    <div>
      <AdminPageHeader
        title="Categories"
        subtitle={`${rows.length} categor${rows.length === 1 ? "y" : "ies"} in the tree`}
      />
      <CategoriesClient items={roots} />
    </div>
  );
}
