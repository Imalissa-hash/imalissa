import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withApi, jsonOk, parseBody, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { slugify } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const idFrom = async (ctx?: Ctx): Promise<string> => (await ctx?.params)?.id ?? "";

// ── Zod helpers (same contract as /api/admin/categories) ───
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

const patchSchema = categoryBody.partial();

/** Walk up from the candidate parent — reaching `id` means the move creates a cycle. */
async function assertNoCycle(id: string, parentId: string): Promise<void> {
  let cur: string | null = parentId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    if (cur === id) throw conflict("Cannot move a category under itself or one of its children");
    seen.add(cur);
    const node: { parentId: string | null } | null = await prisma.category.findUnique({
      where: { id: cur },
      select: { parentId: true },
    });
    cur = node?.parentId ?? null;
  }
}

// ── PATCH /api/admin/categories/[id] ───────────────────────
export const PATCH = withApi<Ctx>(async (req: NextRequest, ctx?: Ctx) => {
  const admin = await requireAdmin();
  const id = await idFrom(ctx);
  if (!id) throw notFound("Category not found");

  const existing = await prisma.category.findUnique({ where: { id }, select: { id: true, name: true, slug: true } });
  if (!existing) throw notFound("Category not found");

  const body = parseBody(patchSchema, await req.json().catch(() => ({})));

  if (body.parentId) {
    if (body.parentId === id) throw conflict("Cannot make a category its own parent");
    const parent = await prisma.category.findUnique({ where: { id: body.parentId }, select: { id: true } });
    if (!parent) throw badRequest("parentId: Choose a valid parent category");
    await assertNoCycle(id, body.parentId);
  }

  let slug: string | undefined;
  if (body.slug !== undefined) {
    const desired = body.slug ? slugify(body.slug) : slugify(body.name ?? existing.name);
    if (!desired) throw badRequest("slug: Could not generate a slug from the name");
    if (desired !== existing.slug) {
      const dup = await prisma.category.findUnique({ where: { slug: desired }, select: { id: true } });
      if (dup && dup.id !== id) throw conflict(`Slug "${desired}" is already in use — pick another`);
    }
    slug = desired;
  }

  const data: Prisma.CategoryUncheckedUpdateInput = {};
  if (body.name !== undefined) data.name = body.name;
  if (slug !== undefined) data.slug = slug;
  if (body.parentId !== undefined) data.parentId = body.parentId;
  if (body.description !== undefined) data.description = body.description;
  if (body.image !== undefined) data.image = body.image;
  if (body.icon !== undefined) data.icon = body.icon;
  if (body.position !== undefined) data.position = body.position;
  if (body.isActive !== undefined) data.isActive = body.isActive;

  await prisma.category.update({ where: { id }, data });

  await audit({
    adminId: admin.id,
    action: "CATEGORY_UPDATE",
    entityType: "Category",
    entityId: id,
    details: { name: body.name ?? existing.name },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({ id });
});

// ── DELETE /api/admin/categories/[id] ──────────────────────
export const DELETE = withApi<Ctx>(async (req: NextRequest, ctx?: Ctx) => {
  const admin = await requireAdmin();
  const id = await idFrom(ctx);
  if (!id) throw notFound("Category not found");

  const existing = await prisma.category.findUnique({
    where: { id },
    select: { id: true, name: true, _count: { select: { children: true, products: true } } },
  });
  if (!existing) throw notFound("Category not found");

  if (existing._count.children > 0) {
    throw conflict(
      `This category has ${existing._count.children} subcategor${existing._count.children === 1 ? "y" : "ies"} — move or delete them first.`
    );
  }
  if (existing._count.products > 0) {
    throw conflict(
      `${existing._count.products} product${existing._count.products === 1 ? " is" : "s are"} assigned to this category — reassign them before deleting it.`
    );
  }

  await prisma.category.delete({ where: { id } });

  await audit({
    adminId: admin.id,
    action: "CATEGORY_DELETE",
    entityType: "Category",
    entityId: id,
    details: { name: existing.name },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({ id });
});
