import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma, type HomeSection } from "@prisma/client";
import { withApi, jsonOk, parseBody, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { badRequest, conflict } from "@/lib/errors";
import type { SectionRow } from "@/components/admin/content/SectionsEditor";

export const dynamic = "force-dynamic";

// ── Zod helpers ───────────────────────────────────────────
const textOrNull = (max: number) =>
  z.preprocess(
    (v) => (v === undefined ? undefined : v === null || (typeof v === "string" && !v.trim()) ? null : v),
    z.string().trim().max(max, `Too long (max ${max} characters)`).nullable().optional()
  );

/** Non-nullable Prisma Int: "" → no change, null → rejected, NaN → rejected. */
const intOpt = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === undefined || v === "" ? undefined : v === null ? NaN : Number(v)),
    z.number().int().min(min).max(max).optional()
  );

const sectionFields = {
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
};

const createSchema = z.object({
  key: z.string().trim().min(2, "Key must be at least 2 characters").max(64),
  ...sectionFields,
});

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

// ── GET /api/admin/homepage/sections — all sections, ordered ──
// The storefront (getHomeSections) filters isVisible + order asc — no
// pagination here because the editor needs the full list to reorder.
export const GET = withApi(async () => {
  await requireAdmin();

  const rows = await prisma.homeSection.findMany({ orderBy: { order: "asc" } });
  return jsonOk({ items: rows.map(toRow), total: rows.length });
});

// ── POST /api/admin/homepage/sections — create ────────────
export const POST = withApi(async (req: NextRequest) => {
  const admin = await requireAdmin();
  const body = parseBody(createSchema, await req.json().catch(() => ({})));

  const rawKey = body.key.toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(rawKey)) {
    throw badRequest("key: Use only letters, numbers, dashes or underscores");
  }
  assertItemIds(body.itemIds);

  const taken = await prisma.homeSection.findUnique({ where: { key: rawKey }, select: { id: true } });
  if (taken) throw conflict(`Section key "${rawKey}" already exists`);

  let order = body.order;
  if (order === undefined) {
    const last = await prisma.homeSection.findFirst({
      orderBy: { order: "desc" },
      select: { order: true },
    });
    order = (last?.order ?? -1) + 1;
  }

  let section: { id: string; key: string };
  try {
    section = await prisma.homeSection.create({
      data: {
        key: rawKey,
        title: body.title,
        subtitle: body.subtitle ?? null,
        type: body.type ?? "PRODUCT_GRID",
        source: body.source,
        // Nullable Json columns need DbNull — plain null is rejected by Prisma's types.
        itemIds: body.itemIds ?? Prisma.DbNull,
        image: body.image ?? null,
        link: body.link ?? null,
        buttonText: body.buttonText ?? null,
        order,
        isVisible: body.isVisible ?? true,
      },
      select: { id: true, key: true },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw conflict(`Section key "${rawKey}" already exists`);
    }
    throw err;
  }

  await audit({
    adminId: admin.id,
    action: "HOME_SECTION_CREATE",
    entityType: "HomeSection",
    entityId: section.id,
    details: { key: section.key, title: body.title, source: body.source, order },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({ id: section.id, key: section.key });
});
