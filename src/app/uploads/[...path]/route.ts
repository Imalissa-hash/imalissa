import { NextRequest, NextResponse } from "next/server";
import { promises as fsp } from "node:fs";
import path from "node:path";

type Ctx = { params: Promise<{ path: string[] }> };

/**
 * GET /uploads/<dir>/<file> — serves images that were written at runtime.
 *
 * Why this route exists: `next start` scans `public/` exactly ONCE, at server
 * boot (node_modules/next/dist/server/lib/router-utils/filesystem.js fills
 * `publicFolderItems` with recursiveReadDir), and in production a path that is
 * missing from that snapshot is a hard 404 — even though the file is on disk.
 * So every image uploaded after the server came up (i.e. all admin uploads
 * until the next restart) rendered as a broken/missing photo.
 *
 * Files that WERE present at boot are still served by Next's own static layer,
 * which is consulted first; this handler is the fallback for the rest, so a
 * fresh upload displays immediately — no restart needed.
 */

/** Same folders /api/admin/upload is allowed to write into. */
const DIRS = new Set(["products", "categories", "banners", "brands", "settings"]);

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

async function serve(req: NextRequest, ctx: Ctx, withBody: boolean) {
  const segments = (await ctx.params).path ?? [];

  // Exactly <dir>/<file>, whitelisted dir, and no traversal tricks.
  if (segments.length !== 2 || !DIRS.has(segments[0])) return notFound();
  if (segments.some((s) => !s || s === "." || s === ".." || s.includes("\\") || s.includes("\0"))) {
    return notFound();
  }

  const type = MIME[path.posix.extname(segments[1]).toLowerCase()];
  if (!type) return notFound();

  const uploadsRoot = path.resolve(path.join(process.cwd(), "public", "uploads"));
  const filePath = path.resolve(path.join(uploadsRoot, segments[0], segments[1]));
  if (!filePath.startsWith(uploadsRoot + path.sep)) return notFound();

  const stat = await fsp.stat(filePath).catch(() => null);
  if (!stat?.isFile()) {
    // Local dev shares the production database (see .env PUBLIC_ASSET_BASE_URL),
    // so a product can reference an image that only exists on the live host.
    // Fetch it once from there and keep a local copy; unset on Render, so the
    // live site never calls itself.
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
          return new NextResponse(bytes, {
            status: 200,
            headers: { "Content-Type": type, "Cache-Control": CACHE_CONTROL },
          });
        }
      }
    }
    return notFound();
  }

  const headers: Record<string, string> = {
    "Content-Type": type,
    "Cache-Control": CACHE_CONTROL,
    ETag: `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`,
  };

  if (req.headers.get("if-none-match") === headers.ETag) {
    return new NextResponse(null, { status: 304, headers });
  }
  if (!withBody) return new NextResponse(null, { status: 200, headers });

  const body = await fsp.readFile(filePath).catch(() => null);
  if (!body) return notFound();

  return new NextResponse(body, { status: 200, headers });
}

export const GET = (req: NextRequest, ctx: Ctx) => serve(req, ctx, true);
export const HEAD = (req: NextRequest, ctx: Ctx) => serve(req, ctx, false);
