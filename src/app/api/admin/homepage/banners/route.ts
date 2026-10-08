import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma, Banner } from "@prisma/client";
import { withApi, jsonOk, parseBody, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { badRequest } from "@/lib/errors";
import type { BannerRow } from "@/components/admin/content/BannersManager";

export const dynamic = "force-dynamic";

const POSITIONS = ["HERO", "PROMO", "STRIP", "FOOTER"] as const;
type Position = (typeof POSITIONS)[number];

// ── Zod helpers ───────────────────────────────────────────
const textOrNull = (max: number) =>
  z.preprocess(
    (v) => (v === undefined ? undefined : v === null || (typeof v === "string" && !v.trim()) ? null : v),
    z.string().trim().max(max, `Too long (max ${max} characters)`).nullable().optional()
  );

const bannerBody = z.object({
  title: z.string().trim().min(2, "Title must be at least 2 characters").max(120),
  subtitle: textOrNull(200),
  image: z.string().trim().min(1, "Image is required").max(500),
  mobileImage: textOrNull(500),
  link: textOrNull(300),
  buttonText: textOrNull(60),
  position: z.enum(POSITIONS).optional(),
  isActive: z.boolean().optional(),
});

const createSchema = bannerBody;

function validImageUrl(url: string): boolean {
  return url.startsWith("/uploads/") || /^https?:\/\//.test(url);
}

function assertImageUrls(image: string, mobileImage: string | null | undefined): void {
  if (!validImageUrl(image)) {
    throw badRequest("image: Must be an uploaded /uploads/… path or an absolute http(s) URL");
  }
  if (mobileImage && !validImageUrl(mobileImage)) {
    throw badRequest("mobileImage: Must be an uploaded /uploads/… path or an absolute http(s) URL");
  }
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

// ── GET /api/admin/homepage/banners — list (?position=) ───
export const GET = withApi(async (req: NextRequest) => {
  await requirePermission("homepage.view");

  const positionRaw = (new URL(req.url).searchParams.get("position") ?? "").trim();
  if (positionRaw && !POSITIONS.includes(positionRaw as Position)) {
    throw badRequest(`Invalid position — use one of: ${POSITIONS.join(", ")}`);
  }

  const where: Prisma.BannerWhereInput = positionRaw ? { position: positionRaw as Position } : {};
  const rows = await prisma.banner.findMany({
    where,
    orderBy: [{ position: "asc" }, { positionIndex: "asc" }],
  });

  return jsonOk({ items: rows.map(toRow), total: rows.length });
});

// ── POST /api/admin/homepage/banners — create ─────────────
export const POST = withApi(async (req: NextRequest) => {
  const admin = await requirePermission("homepage.manage");
  const body = parseBody(createSchema, await req.json().catch(() => ({})));
  const position = body.position ?? "HERO";

  assertImageUrls(body.image, body.mobileImage);

  // Append to the end of the chosen position slot.
  const last = await prisma.banner.findFirst({
    where: { position },
    orderBy: { positionIndex: "desc" },
    select: { positionIndex: true },
  });

  const banner = await prisma.banner.create({
    data: {
      title: body.title,
      subtitle: body.subtitle ?? null,
      image: body.image,
      mobileImage: body.mobileImage ?? null,
      link: body.link ?? null,
      buttonText: body.buttonText ?? null,
      position,
      isActive: body.isActive ?? true,
      positionIndex: (last?.positionIndex ?? -1) + 1,
    },
    select: { id: true },
  });

  await audit({
    adminId: admin.id,
    action: "BANNER_CREATE",
    entityType: "Banner",
    entityId: banner.id,
    details: { title: body.title, position, image: body.image },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({ id: banner.id });
});
