import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma, Banner } from "@prisma/client";
import { withApi, jsonOk, parseBody, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { badRequest, notFound } from "@/lib/errors";
import type { BannerRow } from "@/components/admin/content/BannersManager";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const idFrom = async (ctx?: Ctx): Promise<string> => (await ctx?.params)?.id ?? "";

const POSITIONS = ["HERO", "PROMO", "STRIP", "FOOTER"] as const;
type Position = (typeof POSITIONS)[number];

// ── Zod helpers (same contract as /api/admin/homepage/banners) ──
const textOrNull = (max: number) =>
  z.preprocess(
    (v) => (v === undefined ? undefined : v === null || (typeof v === "string" && !v.trim()) ? null : v),
    z.string().trim().max(max, `Too long (max ${max} characters)`).nullable().optional()
  );

const patchSchema = z.object({
  title: z.string().trim().min(2, "Title must be at least 2 characters").max(120),
  subtitle: textOrNull(200),
  image: z.string().trim().min(1, "Image is required").max(500),
  mobileImage: textOrNull(500),
  link: textOrNull(300),
  buttonText: textOrNull(60),
  position: z.enum(POSITIONS).optional(),
  isActive: z.boolean().optional(),
}).partial();

function validImageUrl(url: string): boolean {
  return url.startsWith("/uploads/") || /^https?:\/\//.test(url);
}

function toRow(b: Banner): BannerRow {
  return {
    id: b.id,
    title: b.title,
    subtitle: b.subtitle,
    image: b.image,
    mobileImage: b.mobileImage,
    link: b.link,
    buttonText: b.buttonText,
    position: b.position,
    isActive: b.isActive,
    positionIndex: b.positionIndex,
    createdAt: new Date(b.createdAt).toISOString(),
    updatedAt: new Date(b.updatedAt).toISOString(),
  };
}

// ── GET /api/admin/homepage/banners/[id] — full detail ────
export const GET = withApi<Ctx>(async (req: NextRequest, ctx?: Ctx) => {
  await requirePermission("homepage.view");
  const id = await idFrom(ctx);
  if (!id) throw notFound("Banner not found");

  const banner = await prisma.banner.findUnique({ where: { id } });
  if (!banner) throw notFound("Banner not found");

  return jsonOk(toRow(banner));
});

// ── PATCH /api/admin/homepage/banners/[id] — partial update ──
export const PATCH = withApi<Ctx>(async (req: NextRequest, ctx?: Ctx) => {
  const admin = await requirePermission("homepage.manage");
  const id = await idFrom(ctx);
  if (!id) throw notFound("Banner not found");

  const existing = await prisma.banner.findUnique({ where: { id } });
  if (!existing) throw notFound("Banner not found");

  const body = parseBody(patchSchema, await req.json().catch(() => ({})));

  if (body.image !== undefined && !validImageUrl(body.image)) {
    throw badRequest("image: Must be an uploaded /uploads/… path or an absolute http(s) URL");
  }
  if (body.mobileImage && !validImageUrl(body.mobileImage)) {
    throw badRequest("mobileImage: Must be an uploaded /uploads/… path or an absolute http(s) URL");
  }

  const data: Prisma.BannerUncheckedUpdateInput = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.subtitle !== undefined) data.subtitle = body.subtitle;
  if (body.image !== undefined) data.image = body.image;
  if (body.mobileImage !== undefined) data.mobileImage = body.mobileImage;
  if (body.link !== undefined) data.link = body.link;
  if (body.buttonText !== undefined) data.buttonText = body.buttonText;
  if (body.isActive !== undefined) data.isActive = body.isActive;

  // Moving between slots appends to the end of the target position.
  if (body.position !== undefined && body.position !== existing.position) {
    const last = await prisma.banner.findFirst({
      where: { position: body.position },
      orderBy: { positionIndex: "desc" },
      select: { positionIndex: true },
    });
    data.position = body.position;
    data.positionIndex = (last?.positionIndex ?? -1) + 1;
  }

  await prisma.banner.update({ where: { id }, data });

  const details: Record<string, unknown> = { title: body.title ?? existing.title };
  if (body.isActive !== undefined && body.isActive !== existing.isActive) {
    details.isActive = { from: existing.isActive, to: body.isActive };
  }
  if (data.position !== undefined && data.position !== existing.position) {
    details.position = { from: existing.position, to: data.position };
  }

  await audit({
    adminId: admin.id,
    action: "BANNER_UPDATE",
    entityType: "Banner",
    entityId: id,
    details,
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({ id });
});

// ── DELETE /api/admin/homepage/banners/[id] ───────────────
export const DELETE = withApi<Ctx>(async (req: NextRequest, ctx?: Ctx) => {
  const admin = await requirePermission("homepage.manage");
  const id = await idFrom(ctx);
  if (!id) throw notFound("Banner not found");

  const existing = await prisma.banner.findUnique({
    where: { id },
    select: { id: true, title: true, position: true },
  });
  if (!existing) throw notFound("Banner not found");

  await prisma.banner.delete({ where: { id } });

  await audit({
    adminId: admin.id,
    action: "BANNER_DELETE",
    entityType: "Banner",
    entityId: id,
    details: { title: existing.title, position: existing.position },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({ id });
});
