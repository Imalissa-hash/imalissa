import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { badRequest, conflict } from "@/lib/errors";
import { appendSuffix, slugify } from "@/lib/utils";
import type { CategoryTreeNode } from "@/components/admin/catalog/CategoriesClient";

export const dynamic = "force-dynamic";

// ── Zod helpers ─────────────────────────────────────────────
const toNullIfBlank = (v: unknown) => (v === "" || v === null ? null : v);

const textOrNull = (max: number) =>
  z.preprocess(
    (v) => (v === undefined ? undefined : v === null || (typeof v === "string" && !v.trim()) ? null : v),
    z.string().trim().max(max, `Too long (max ${max} characters)`).nullable().optional()
  );

/** Non-nullable Prisma Int column: null / "" is invalid input (400), absent = no change. */
const intOpt = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === undefined ? undefined : v === "" || v === null ? NaN : Number(v)),
    z.number().int().min(min).max(max).optional()
  );

const categoryBody = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  slug: z.preprocess(toNullIfBlank, z.string().trim().min(2).max(160).nullable().optional()),
  parentId: z.preprocess(toNullIfBlank, z.string().trim().min(1).nullable().optional()),
  description: textOrNull(2000),
  image: textOrNull(500),
  icon: textOrNull(64),
  position: intOpt(0, 9999),
  isActive: z.boolean().optional(),
});

const createSchema = categoryBody;

async function uniqueCategorySlug(base: string): Promise<string> {
  let slug = base;
  for (let i = 2; i <= 50; i++) {
    const hit = await prisma.category.findUnique({ where: { slug }, select: { id: true } });
    if (!hit) return slug;
    slug = appendSuffix(base, i);
  }
  throw conflict("Could not allocate a unique slug — please pick one manually");
}

// ── GET /api/admin/categories — tree with product counts ───
export const GET = withApi(async (req: NextRequest) => {
  await requirePermission("categories.view");

  const rows = await prisma.category.findMany({
    orderBy: [{ position: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: true, children: true } } },
  });

  const nodes = new Map<string, CategoryTreeNode & { parentId: string | null }>();
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

  const roots: (CategoryTreeNode & { parentId: string | null })[] = [];
  for (const r of rows) {
    const node = nodes.get(r.id)!;
    if (r.parentId && nodes.has(r.parentId)) nodes.get(r.parentId)!.children.push(node);
    else roots.push(node);
  }

  return jsonOk({ items: roots, total: rows.length });
});

// ── POST /api/admin/categories — create ────────────────────
export const POST = withApi(async (req: NextRequest) => {
  const admin = await requirePermission("categories.manage");
  const body = parseBody(createSchema, await req.json().catch(() => ({})));

  if (body.parentId) {
    const parent = await prisma.category.findUnique({ where: { id: body.parentId }, select: { id: true } });
    if (!parent) throw badRequest("parentId: Choose a valid parent category");
  }

  const slug = await uniqueCategorySlug(body.slug ? slugify(body.slug) : slugify(body.name));
  if (!slug) throw badRequest("slug: Could not generate a slug from the name");

  const category = await prisma.category.create({
    data: {
      name: body.name,
      slug,
      parentId: body.parentId ?? null,
      description: body.description ?? null,
      image: body.image ?? null,
      icon: body.icon ?? null,
      position: body.position ?? 0,
      isActive: body.isActive ?? true,
    },
    select: { id: true, slug: true },
  });

  await audit({
    adminId: admin.id,
    action: "CATEGORY_CREATE",
    entityType: "Category",
    entityId: category.id,
    details: { name: body.name, slug: category.slug, parentId: body.parentId ?? null },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({ id: category.id, slug: category.slug });
});
