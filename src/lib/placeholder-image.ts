/**
 * ============================================================
 * Placeholder image for missing / unreadable uploads
 * ============================================================
 *
 * Render's free tier destroys anything under `public/uploads` that is not
 * also stored in the database. Three product photos from 7 Oct predate the
 * durable StoredImage dual-write, so their bytes are gone for good — and
 * their URLs used to answer an EMPTY 404, which made Next's image optimizer
 * log "internal image response is empty" and drew a broken-image icon on the
 * homepage and product pages.
 *
 * Those URLs now answer with this PNG instead: a real image, so the optimizer
 * is happy, the page looks intentional, and no product card renders broken.
 *
 * It is a 320x320 palette PNG (~2.9 KB) generated from an SVG by
 * backups/gen-placeholder.mjs — flat ink background, a gold-outlined bag and
 * the wordmark, matching the storefront's palette. Keeping the bytes here
 * rather than in /public means the placeholder itself survives every deploy.
 *
 * The serve route caches it for only 5 minutes, so re-uploading the real
 * photo replaces the placeholder on the site within minutes.
 */

export const PLACEHOLDER_PNG_B64 =
  "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";
