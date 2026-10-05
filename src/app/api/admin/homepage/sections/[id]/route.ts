import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma, type HomeSection } from "@prisma/client";
import { withApi, jsonOk, parseBody, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { badRequest, notFound } from "@/lib/errors";
import type { SectionRow } from "@/components/admin/content/SectionsEditor";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const idFrom = async (ctx?: Ctx): Promise<string> => (await ctx?.params)?.id ?? "";

// ── Zod helpers (same contract as /api/admin/homepage/sections) ──
const textOrNull = (max: number) =>
  z.preprocess(
    (v) => (v === undefined ? undefined : v === null || (typeof v === "string" && !v.trim()) ? null : v),
    z.string().trim().max(max, `Too long (max ${max} characters)`).nullable().optional()
  );

const intOpt = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === undefined || v === "" ? undefined : v === null ? NaN : Number(v)),
    z.number().int().min(min).max(max).optional()
  );

const patchSchema = z.object({
  title: z.string().trim().min(2, "Title must be at least 2 characters").max(120),
  subtitle: textOrNull(200),
  type: z.enum(["PRODUCT_GRID", "CATEGORY_GRID", "BANNER_GRID", "TEXT_ONLY"]).optional(),
  source: z.string().trim().min(1, "Source is required").max(64),
  link: textOrNull(300),
  buttonText: textOrNull(60),
  image: textOrNull(500),
  itemIds: z
    .union([z.array(z.string().trim().min(1).max(64)).max(200), z.null()])
    .optional(),
  order: intOpt(0, 100_000),
  isVisible: z.boolean().optional(),
}).partial();

function assertItemIds(itemIds: string[] | null | undefined): void {
  if (!itemIds) return;
  if (new Set(itemIds).size !== itemIds.length) {
    throw badRequest("itemIds: Remove duplicate product ids");
  }
}

function toRow(s: HomeSection): SectionRow {
  return {
    id: s.id,
    key: s.key,
    title: s.title,
    subtitle: s.subtitle,
    type: s.type,
    source: s.source,
    itemIds: Array.isArray(s.itemIds)
      ? s.itemIds.filter((x): x is string => typeof x === "string")
      : null,
    image: s.image,
    link: s.link,
    buttonText: s.buttonText,
    order: s.order,
    isVisible: s.isVisible,
    updatedAt: new Date(s.updatedAt).toISOString(),
  };
}

// ── GET /api/admin/homepage/sections/[id] — full detail ───
export const GET = withApi<Ctx>(async (req: NextRequest, ctx?: Ctx) => {
  await requireAdmin();
  const id = await idFrom(ctx);
  if (!id) throw notFound("Section not found");

  const section = await prisma.homeSection.findUnique({ where: { id } });
  if (!section) throw notFound("Section not found");

  return jsonOk(toRow(section));
});

// ── PATCH /api/admin/homepage/sections/[id] — partial update ──
// The `key` is immutable: the storefront may reference it (e.g. TEXT_ONLY rails).
export const PATCH = withApi<Ctx>(async (req: NextRequest, ctx?: Ctx) => {
  const admin = await requireAdmin();
  const id = await idFrom(ctx);
  if (!id) throw notFound("Section not found");

  const existing = await prisma.homeSection.findUnique({ where: { id } });
  if (!existing) throw notFound("Section not found");

  const body = parseBody(patchSchema, await req.json().catch(() => ({})));
  assertItemIds(body.itemIds);

  const data: Prisma.HomeSectionUncheckedUpdateInput = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.subtitle !== undefined) data.subtitle = body.subtitle;
  if (body.type !== undefined) data.type = body.type;
  if (body.source !== undefined) data.source = body.source;
  if (body.link !== undefined) data.link = body.link;
  if (body.buttonText !== undefined) data.buttonText = body.buttonText;
  if (body.image !== undefined) data.image = body.image;
  // Nullable Json columns need DbNull — plain null is rejected by Prisma's types.
  if (body.itemIds !== undefined) data.itemIds = body.itemIds ?? Prisma.DbNull;
  if (body.order !== undefined) data.order = body.order;
  if (body.isVisible !== undefined) data.isVisible = body.isVisible;

  await prisma.homeSection.update({ where: { id }, data });

  const details: Record<string, unknown> = { key: existing.key };
  const fields = (Object.keys(body) as (keyof typeof body)[]).filter((k) => body[k] !== undefined);
  details.fields = fields;
  if (body.isVisible !== undefined && body.isVisible !== existing.isVisible) {
    details.isVisible = { from: existing.isVisible, to: body.isVisible };
  }

  await audit({
    adminId: admin.id,
    action: "HOME_SECTION_UPDATE",
    entityType: "HomeSection",
    entityId: id,
    details,
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({ id });
});

// ── DELETE /api/admin/homepage/sections/[id] ──────────────
export const DELETE = withApi<Ctx>(async (req: NextRequest, ctx?: Ctx) => {
  const admin = await requireAdmin();
  const id = await idFrom(ctx);
  if (!id) throw notFound("Section not found");

  const existing = await prisma.homeSection.findUnique({
    where: { id },
    select: { id: true, key: true, title: true },
  });
  if (!existing) throw notFound("Section not found");

  await prisma.homeSection.delete({ where: { id } });

  await audit({
    adminId: admin.id,
    action: "HOME_SECTION_DELETE",
    entityType: "HomeSection",
    entityId: id,
    details: { key: existing.key, title: existing.title },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({ id });
});
