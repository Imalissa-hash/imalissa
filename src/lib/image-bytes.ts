/**
 * ============================================================
 * Image byte validation (magic numbers)
 * ============================================================
 *
 * The upload routes trust the browser's declared MIME type and the serve
 * route trusts the file extension. Both can lie: a `.webp` file whose bytes
 * are actually a PHP script, a HTML page or a truncated download is still
 * served as `image/webp` today. Reading the first few bytes settles it —
 * every real image format starts with a fixed signature.
 *
 * Used by:
 *   - /api/admin/upload + /api/chat/upload → refuse files whose bytes do
 *     not match the declared type (so a renamed file can never be stored).
 *   - /uploads/[...path] → the CONTENT-TYPE header is decided by the bytes,
 *     not by the extension, so a browser always gets the truth.
 */

/** Detected image type, or null when the bytes are not a known image. */
export type ImageKind = "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "image/avif" | "image/svg+xml";

const ascii = (b: Buffer, start: number, len: number) =>
  b.subarray(start, start + len).toString("latin1");

/**
 * Identify an image from its leading bytes. Needs only the first 32 bytes,
 * but callers may pass the whole buffer.
 */
export function sniffImageKind(b: Buffer | Uint8Array | null | undefined): ImageKind | null {
  if (!b || b.length < 12) return null;
  const buf = Buffer.isBuffer(b) ? b : Buffer.from(b);

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return "image/png";
  }

  // GIF: "GIF87a" / "GIF89a"
  const gif = ascii(buf, 0, 6);
  if (gif === "GIF87a" || gif === "GIF89a") return "image/gif";

  // WebP / AVIF both live in a RIFF container: "RIFF" + size + "WEBP" | "ftyp"
  if (ascii(buf, 0, 4) === "RIFF") {
    if (ascii(buf, 8, 4) === "WEBP") return "image/webp";
    // AVIF: RIFF .... ftypavif (or avis for animated)
    if (ascii(buf, 8, 4) === "ftyp" && (ascii(buf, 12, 4) === "avif" || ascii(buf, 12, 4) === "avis")) {
      return "image/avif";
    }
    return null; // some other RIFF container (wav/avi) — not an image
  }

  // ISO-BMFF directly (no RIFF wrapper): "ftyp" at offset 4
  if (ascii(buf, 4, 4) === "ftyp") {
    const brand = ascii(buf, 8, 4);
    if (brand === "avif" || brand === "avis") return "image/avif";
    return null;
  }

  // SVG: a text format — allow only after skipping whitespace/BOM, and never
  // anything that smells like a script (the upload routes reject SVG anyway;
  // this exists so the serve route can classify it correctly).
  const head = buf.subarray(0, 512).toString("utf8").replace(/^\uFEFF/, "").trimStart();
  if (
    head.startsWith("<?xml") ||
    head.startsWith("<svg") ||
    head.startsWith("<!--") ||
    /^<!DOCTYPE\s+svg/i.test(head)
  ) {
    if (/<svg[\s>]/i.test(head) && !/<script/i.test(head)) return "image/svg+xml";
  }

  return null;
}

/** Extension → the types that extension is allowed to hold. */
const EXT_KINDS: Record<string, ImageKind[]> = {
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".png": ["image/png"],
  ".webp": ["image/webp"],
  ".gif": ["image/gif"],
  ".avif": ["image/avif"],
  ".svg": ["image/svg+xml"],
};

/**
 * True when the bytes really are what the extension claims. A file whose
 * extension is not an image type at all is never valid.
 */
export function bytesMatchExtension(b: Buffer | Uint8Array | null | undefined, ext: string): boolean {
  const allowed = EXT_KINDS[ext.toLowerCase()];
  if (!allowed) return false;
  const kind = sniffImageKind(b);
  return kind !== null && allowed.includes(kind);
}

/** Re-export so callers need only one import. */
export { EXT_KINDS };
