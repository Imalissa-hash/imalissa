import { NextRequest } from "next/server";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { withApi, jsonOk, rateLimit, clientIp } from "@/lib/api";
import { requireAdmin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { badRequest } from "@/lib/errors";
import { bytesMatchExtension } from "@/lib/image-bytes";

export const dynamic = "force-dynamic";

/** Whitelisted upload folders → public/uploads/<dir>. */
const DIRS = ["products", "categories", "banners", "brands", "settings"] as const;
type UploadDir = (typeof DIRS)[number];

/** Allowed image mimes → canonical extension (extension is derived from the
 *  mime type, never from the client-supplied filename). */
const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
};

const MAX_BYTES = 4 * 1024 * 1024; // 4MB

/** POST /api/admin/upload — multipart upload of a single image ("file" field).
 *  Query: ?dir=products|categories|banners|brands (default: products). */
export const POST = withApi(async (req: NextRequest) => {
  rateLimit(`admin-upload:${clientIp(req)}`, 30, 60_000);
  const admin = await requireAdmin();

  const dirParam = new URL(req.url).searchParams.get("dir") ?? "products";
  if (!DIRS.includes(dirParam as UploadDir)) {
    throw badRequest(`Invalid upload folder — use one of: ${DIRS.join(", ")}`);
  }
  const dir = dirParam as UploadDir;

  const form = await req.formData().catch(() => null);
  const entry = form?.get("file");
  if (!entry || typeof entry === "string") {
    throw badRequest('No file received — send it as multipart field "file"');
  }
  if (entry.size === 0) throw badRequest("The file is empty");
  if (entry.size > MAX_BYTES) throw badRequest("File is too large — the maximum size is 4MB");

  const ext = MIME_EXT[entry.type];
  if (!ext) throw badRequest("Unsupported file type. Allowed: JPEG, PNG, WebP, GIF, SVG");

  // Sanitize the stem: strip any path/extension, keep URL-safe chars only.
  const stem =
    (entry.name || "image")
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "image";
  const name = `${Date.now()}-${stem}${ext}`;

  const dirPath = path.join(process.cwd(), "public", "uploads", dir);
  mkdirSync(dirPath, { recursive: true });
  const bytes = Buffer.from(await entry.arrayBuffer());

  // The browser-declared mime only names the extension — it does not prove
  // the file is really an image. Check the magic bytes too, so a renamed
  // script/page can never be written into public/uploads (and from there
  // served back to visitors as an image).
  if (!bytesMatchExtension(bytes, ext)) {
    throw badRequest("This file is not a valid image — its contents do not match its type");
  }

  writeFileSync(path.join(dirPath, name), bytes);

  // Durable copy in the shared DB. public/ is only a cache on Render (the
  // free tier's disk is wiped on every deploy), so the bytes must live
  // there too — otherwise the image survives until the next deploy and then
  // silently disappears for every device without a warm browser cache.
  try {
    await prisma.storedImage.upsert({
      where: { key: `${dir}/${name}` },
      update: { mime: entry.type, bytes },
      create: { key: `${dir}/${name}`, mime: entry.type, bytes },
    });
  } catch (err) {
    console.error(
      `[upload] could not persist ${dir}/${name} to the DB — the file works now but will vanish on the next deploy:`,
      err
    );
  }

  await audit({
    adminId: admin.id,
    action: "ASSET_UPLOAD",
    entityType: "Upload",
    entityId: `${dir}/${name}`,
    details: { dir, name, size: entry.size, type: entry.type },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({ url: `/uploads/${dir}/${name}` });
});
