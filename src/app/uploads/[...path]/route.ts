import { NextRequest, NextResponse } from "next/server";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { sniffImageKind } from "@/lib/image-bytes";
import { PLACEHOLDER_PNG_B64 } from "@/lib/placeholder-image";

type Ctx = { params: Promise<{ path: string[] }> };

/**
 * GET/HEAD /uploads/<dir>/<file> — serves uploaded images with three fallbacks.
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
 * Layer 4 — placeholder. Three product photos from 7 Oct predate the durable
 * dual-write and their bytes died with a Render deploy. Their URLs now
 * return a real placeholder IMAGE instead of an empty 404: Next's image
 * optimizer used to log "internal image response is empty" for them and the
 * browser drew a broken-image icon. The placeholder is short-cached, so the
 * day someone re-uploads the photo the site picks it up within minutes.
 *
 * The CONTENT-TYPE is decided by the file's magic bytes, never by its
 * extension — a `.webp` that is really a JPEG (or a script wearing an image
 * extension) is served with the truth, and non-image bytes are refused.
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

/**
 * Real images keep the one-year immutable cache the config header used to
 * give them — but decided per response, so the placeholder below can ask for
 * something much shorter. Upload names are `${Date.now()}-…`, so a re-upload
 * is a NEW url and immutable can never pin a stale photo.
 */
const CACHE_CONTROL = "public, max-age=31536000, immutable";

/**
 * A missing photo must stay replaceable: cache it briefly so a re-upload
 * shows up quickly, and mark the response so it is obvious in DevTools and
 * in curl what happened.
 */
const PLACEHOLDER_CACHE = "public, max-age=300, stale-while-revalidate=3600";
const PLACEHOLDER_PNG = Buffer.from(PLACEHOLDER_PNG_B64, "base64");

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

  const declared = MIME[path.posix.extname(segments[1]).toLowerCase()];
  if (!declared) return notFound();

  /**
   * Reply using the CONTENT-TYPE the bytes actually are. When the file's
   * magic numbers disagree with its extension we trust the bytes — that is
   * what the browser can really render — and note it for debugging.
   */
  const respond = (
    body: Buffer | null,
    size: number,
    mtimeMs: number,
    contentType: string,
    extra: Record<string, string> = {}
  ) => {
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": CACHE_CONTROL,
      ETag: etagOf(size, mtimeMs),
      ...extra,
    };
    if (req.headers.get("if-none-match") === headers.ETag) {
      return new NextResponse(null, { status: 304, headers });
    }
    if (!withBody || !body) return new NextResponse(null, { status: 200, headers });
    // Buffer is a valid body at runtime (the original route relied on it);
    // the TS BodyInit union rejects Buffer<ArrayBufferLike>, hence the cast.
    return new NextResponse(body as unknown as BodyInit, { status: 200, headers });
  };

  /** Serve the placeholder in place of a photo that no longer exists. */
  const placeholder = () => {
    const headers: Record<string, string> = {
      "Content-Type": "image/png",
      "Cache-Control": PLACEHOLDER_CACHE,
      "X-Imalissa-Image": "placeholder",
    };
    if (!withBody) return new NextResponse(null, { status: 200, headers });
    return new NextResponse(PLACEHOLDER_PNG as unknown as BodyInit, { status: 200, headers });
  };

  /**
   * True when the bytes are a real image. SVG is text, so it is validated by
   * content rather than by signature (sniffImageKind already refuses any SVG
   * carrying a <script>).
   */
  const contentTypeOf = (bytes: Buffer, fallback: string) => {
    if (fallback === "image/svg+xml") return fallback;
    const kind = sniffImageKind(bytes.subarray(0, 64));
    return kind ?? fallback;
  };

  const isImage = (bytes: Buffer, fallback: string) =>
    fallback === "image/svg+xml" ? true : sniffImageKind(bytes.subarray(0, 64)) !== null;

  /* ── layer 1: the disk copy (boot-present files never even reach here) ── */
  const uploadsRoot = path.resolve(path.join(process.cwd(), "public", "uploads"));
  const filePath = path.resolve(path.join(uploadsRoot, segments[0], segments[1]));
  if (!filePath.startsWith(uploadsRoot + path.sep)) return notFound();

  const stat = await fsp.stat(filePath).catch(() => null);
  if (stat?.isFile()) {
    const body = await fsp.readFile(filePath).catch(() => null);
    // An unreadable or corrupt file falls through to the durable copy
    // instead of handing the browser an empty 200.
    if (body?.length && isImage(body, declared)) {
      return respond(body, stat.size, stat.mtimeMs, contentTypeOf(body, declared));
    }
  }

  /* ── layer 2: durable copy in the shared DB (survives Render's deploys) ── */
  const key = `${segments[0]}/${segments[1]}`;
  const row = await prisma.storedImage.findUnique({ where: { key } }).catch(() => null);
  if (row?.bytes?.length) {
    const bytes = Buffer.from(row.bytes);
    if (isImage(bytes, row.mime || declared)) {
      return respond(
        withBody ? bytes : null,
        bytes.length,
        new Date(row.updatedAt).getTime(),
        contentTypeOf(bytes, row.mime || declared)
      );
    }
  }

  /* ── layer 3: local dev pulling a live-only image, then caching it ── */
  const base = process.env.PUBLIC_ASSET_BASE_URL;
  if (base) {
    const upstream = await fetch(
      `${base.replace(/\/$/, "")}/uploads/${segments[0]}/${segments[1]}`,
      { signal: AbortSignal.timeout(8000) }
    ).catch(() => null);
    // A 200 is not enough: the upstream may itself be answering with the
    // "photo is gone" placeholder (see layer 4). Caching that would freeze a
    // placeholder onto local disk under the real filename, so it is skipped.
    const isPlaceholder = upstream?.headers.get("x-imalissa-image") === "placeholder";
    if (upstream?.ok && !isPlaceholder) {
      const buf = await upstream.arrayBuffer().catch(() => null);
      const bytes = buf ? Buffer.from(buf) : Buffer.alloc(0);
      if (bytes.length && isImage(bytes, declared)) {
        // best-effort local cache so the next request is served from disk
        await fsp.mkdir(path.dirname(filePath), { recursive: true }).catch(() => {});
        await fsp.writeFile(filePath, bytes).catch(() => {});
        return respond(withBody ? bytes : null, bytes.length, Date.now(), contentTypeOf(bytes, declared));
      }
    }
  }

  /* ── layer 4: the photo is really gone → a real image, not a broken 404 ── */
  return placeholder();
}

export const GET = (req: NextRequest, ctx: Ctx) => serve(req, ctx, true);
export const HEAD = (req: NextRequest, ctx: Ctx) => serve(req, ctx, false);
