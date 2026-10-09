import { NextRequest, NextResponse } from "next/server";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ path: string[] }> };

/**
 * GET/HEAD /uploads/<dir>/<file> — serves uploaded images with two fallbacks.
 *
 * Layer 1 — disk. `next start` scans `public/` exactly ONCE, at server boot
 * (node_modules/next/dist/server/lib/router-utils/filesystem.js fills
 * `publicFolderItems` with recursiveReadDir); files present at boot are
 * served by Next's own static layer before this route runs, and this handler
 * covers the rest: anything written at runtime shows immediately, no restart.
 *
 * Layer 2 — StoredImage (shared MySQL). Render's free tier wipes `public/`
 * on every deploy, which is how live lost its product and category photos:
 * a browser with a warm cache kept showing them while every fresh device got
 * 404. The upload route now writes the bytes to the DB as well, so when the
 * disk copy is gone the image still comes from the database — same bytes on
 * the local site and on the live site, forever.
 *
 * Layer 3 — PUBLIC_ASSET_BASE_URL. Local dev shares the production database,
 * so a product can reference an image that exists only on the live host
 * (uploaded before layer 2 existed): fetch it once from there and keep a
 * local copy. Unset on Render, so the live site never calls itself.
 *
 * Everything is strictly validated: exactly <dir>/<file>, whitelisted dir,
 * no traversal tricks, whitelisted image extension.
 */

/** Same folders /api/admin/upload and /api/chat/upload are allowed to write into. */
const DIRS = new Set(["products", "categories", "banners", "brands", "settings", "chat"]);

/** Extension → content type. Anything not listed here is refused. */
const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

/** Upload names are `${Date.now()}-${stem}${ext}` → unique per upload, so a day of caching is safe. */
const CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=86400";

export const dynamic = "force-dynamic";

const notFound = () => new NextResponse(null, { status: 404 });

const etagOf = (size: number, mtimeMs: number) => `"${size.toString(16)}-${Math.floor(mtimeMs).toString(16)}"`;

async function serve(req: NextRequest, ctx: Ctx, withBody: boolean) {
  const segments = (await ctx.params).path ?? [];

  // Exactly <dir>/<file>, whitelisted dir, and no traversal tricks.
  if (segments.length !== 2 || !DIRS.has(segments[0])) return notFound();
  if (segments.some((s) => !s || s === "." || s === ".." || s.includes("\\") || s.includes("\0"))) {
    return notFound();
  }

  const type = MIME[path.posix.extname(segments[1]).toLowerCase()];
  if (!type) return notFound();

  const respond = (body: Buffer | null, size: number, mtimeMs: number, contentType: string) => {
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": CACHE_CONTROL,
      ETag: etagOf(size, mtimeMs),
    };
    if (req.headers.get("if-none-match") === headers.ETag) {
      return new NextResponse(null, { status: 304, headers });
    }
    if (!withBody || !body) return new NextResponse(null, { status: 200, headers });
    // Buffer is a valid body at runtime (the original route relied on it);
    // the TS BodyInit union rejects Buffer<ArrayBufferLike>, hence the cast.
    return new NextResponse(body as unknown as BodyInit, { status: 200, headers });
  };

  /* ── layer 1: the disk copy (boot-present files never even reach here) ── */
  const uploadsRoot = path.resolve(path.join(process.cwd(), "public", "uploads"));
  const filePath = path.resolve(path.join(uploadsRoot, segments[0], segments[1]));
  if (!filePath.startsWith(uploadsRoot + path.sep)) return notFound();

  const stat = await fsp.stat(filePath).catch(() => null);
  if (stat?.isFile()) {
    const body = withBody ? await fsp.readFile(filePath).catch(() => null) : null;
    if (withBody && !body) return notFound();
    return respond(body, stat.size, stat.mtimeMs, type);
  }

  /* ── layer 2: durable copy in the shared DB (survives Render's deploys) ── */
  const key = `${segments[0]}/${segments[1]}`;
  const row = await prisma.storedImage.findUnique({ where: { key } }).catch(() => null);
  if (row?.bytes?.length) {
    const bytes = Buffer.from(row.bytes);
    if (!withBody) return respond(null, bytes.length, new Date(row.updatedAt).getTime(), row.mime || type);
    return respond(bytes, bytes.length, new Date(row.updatedAt).getTime(), row.mime || type);
  }

  /* ── layer 3: local dev pulling a live-only image, then caching it ── */
  const base = process.env.PUBLIC_ASSET_BASE_URL;
  if (base) {
    const upstream = await fetch(
      `${base.replace(/\/$/, "")}/uploads/${segments[0]}/${segments[1]}`,
      { signal: AbortSignal.timeout(8000) }
    ).catch(() => null);
    if (upstream?.ok) {
      const buf = await upstream.arrayBuffer().catch(() => null);
      const bytes = buf ? Buffer.from(buf) : Buffer.alloc(0);
      if (bytes.length) {
        // best-effort local cache so the next request is served from disk
        await fsp.mkdir(path.dirname(filePath), { recursive: true }).catch(() => {});
        await fsp.writeFile(filePath, bytes).catch(() => {});
        return respond(bytes, bytes.length, Date.now(), type);
      }
    }
  }

  return notFound();
}

export const GET = (req: NextRequest, ctx: Ctx) => serve(req, ctx, true);
export const HEAD = (req: NextRequest, ctx: Ctx) => serve(req, ctx, false);
