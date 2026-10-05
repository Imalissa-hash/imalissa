import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/db";
import { appendSuffix, slugify } from "../../lib/utils";
import { getConfig } from "./config";
import { ExternalCommerceError, notConfigured } from "./errors";

/**
 * ============================================================
 * Partner catalog import (GET {base}/products)
 * ============================================================
 *
 * Pulls the reseller's full live catalog and upserts it into our Product
 * table. Everything here comes from the documented response shape:
 *
 *   { id, title, slug, code, category, description, short_description,
 *     currency, price, reseller_price, regular_price, in_stock,
 *     image, featured_image, images[], colors[], sizes[], weights[] }
 *
 * Rules:
 *  · matched by partner `id` (stored on Product.externalProductId), then by
 *    SKU (their `code`), then by slug — so a re-import UPDATES, never duplicates;
 *  · existing manual edits we never touch: status, feature flags, brand;
 *  · `in_stock: false` ⇒ our stock is forced to 0 (the product stops selling);
 *  · a failed row is reported, it never aborts the whole import;
 *  · images stay on the partner CDN (absolute URLs) — they are re-read on
 *    every import so changed photos follow.
 *
 * PRICE RULE (the storefront shows the CUSTOMER price, never the reseller one):
 *   partner `reseller_price` (== their `price`) = what WE pay     → costPrice
 *   partner `regular_price`                    = what the customer
 *                                                 pays           → price
 *   `regular_price` is only used when it is above our cost — we never
 *   publish a selling price below what the item costs us.
 */

export interface PartnerProduct {
  id?: string | null;
  title?: string | null;
  slug?: string | null;
  code?: string | null;
  category?: string | null;
  description?: string | null;
  short_description?: string | null;
  currency?: string | null;
  price?: number | string | null;
  reseller_price?: number | string | null;
  regular_price?: number | string | null;
  in_stock?: boolean | null;
  image?: string | null;
  featured_image?: string | null;
  images?: unknown;
  colors?: unknown;
  sizes?: unknown;
}

export interface CatalogImportSummary {
  /** Rows the partner returned for this request. */
  fetched: number;
  /** Rows actually processed (≠ fetched when importing a selection). */
  selected: number;
  created: number;
  updated: number;
  skipped: number;
  categoriesCreated: number;
  /** Products WE carry that the partner no longer lists (informational). */
  missingFromPartner: number;
  /** Per-row problems — the import continues past each one. */
  errors: string[];
  durationMs: number;
}

/**
 * The partner only exposes a boolean stock flag, so an importable product
 * gets a modest sellable quantity. It is refreshed (and can drop to 0) on
 * every re-import — it is OUR gate, not a claim about their warehouse.
 */
const STOCK_WHEN_IN_STOCK = 10;

const REQUEST_TIMEOUT_MS = 60_000;

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function stringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out = v
    .map((x) => (typeof x === "string" ? x.trim() : null))
    .filter((x): x is string => Boolean(x));
  return out.length ? out : null;
}

function absoluteUrls(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((u) => /^https?:\/\//i.test(u));
}

/** GET the partner catalog. Throws ExternalCommerceError on any failure. */
export async function fetchPartnerCatalog(): Promise<PartnerProduct[]> {
  const cfg = getConfig();

  if (cfg.mode !== "live") {
    throw notConfigured(
      `Catalog import needs live mode (currently "${cfg.mode}"). Set Mode = live in Admin → Settings → External API.`
    );
  }
  if (!cfg.baseUrl) {
    throw notConfigured("Partner base URL is empty — set it in Admin → Settings → External API.");
  }
  if (!cfg.apiKey) {
    throw notConfigured("Partner API key is empty — set it in Admin → Settings → External API.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.baseUrl}/products`, {
      method: "GET",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 500);
      throw new ExternalCommerceError(
        res.status === 401 || res.status === 403
          ? "AUTH"
          : res.status === 429
            ? "RATE_LIMIT"
            : res.status >= 500
              ? "SERVER"
              : "VALIDATION",
        `Partner catalog request failed (HTTP ${res.status})${body ? `: ${body}` : ""}`,
        { ambiguous: false, status: res.status }
      );
    }

    const payload: unknown = await res.json();
    if (!Array.isArray(payload)) {
      throw new ExternalCommerceError(
        "VALIDATION",
        "Partner catalog response was not a JSON array",
        { ambiguous: false }
      );
    }
    return payload.filter(
      (row): row is PartnerProduct => typeof row === "object" && row !== null
    );
  } catch (err) {
    if (err instanceof ExternalCommerceError) throw err;
    const isAbort = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
    throw new ExternalCommerceError(
      isAbort ? "TIMEOUT" : "NETWORK",
      isAbort
        ? `Partner catalog request timed out after ${REQUEST_TIMEOUT_MS}ms`
        : `Could not reach partner catalog: ${err instanceof Error ? err.message : String(err)}`,
      { ambiguous: false, cause: err }
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The partner catalog is ~2.4 MB and takes 10-15s to download. The import
 * page shows it as a browsable list and imports run against the SAME rows,
 * so the process keeps the last fetch for a short while. `cached: true` is
 * reported to the UI (the "loaded at" time is always shown) — a stale view
 * is never passed off as a fresh one.
 */
const CATALOG_TTL_MS = 120_000;
let catalogCache: { at: number; rows: PartnerProduct[] } | null = null;

async function loadCatalogRows(opts?: {
  refresh?: boolean;
}): Promise<{ rows: PartnerProduct[]; loadedAt: number; cached: boolean }> {
  if (!opts?.refresh && catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) {
    return { rows: catalogCache.rows, loadedAt: catalogCache.at, cached: true };
  }
  const rows = await fetchPartnerCatalog();
  catalogCache = { at: Date.now(), rows };
  return { rows, loadedAt: catalogCache.at, cached: false };
}

/** One line of the import screen — no descriptions (the payload is huge). */
export interface CatalogPreviewRow {
  partnerId: string | null;
  code: string | null;
  name: string;
  slug: string | null;
  category: string | null;
  image: string | null;
  /** What OUR customer pays (partner `regular_price`). */
  customerPrice: number | null;
  /** What we pay the partner (their `reseller_price`) — admin only. */
  costPrice: number | null;
  inStock: boolean;
}

export interface CatalogSnapshot {
  rows: CatalogPreviewRow[];
  /** ISO time the partner payload was actually downloaded. */
  loadedAt: string;
  /** True when this answer came from the short-lived in-process cache. */
  cached: boolean;
}

function previewRow(row: PartnerProduct): CatalogPreviewRow | null {
  const name = str(row.title);
  if (!name) return null;
  const cost = num(row.reseller_price) ?? num(row.price);
  const regular = num(row.regular_price);
  const customer = regular !== null && cost !== null && regular > cost ? regular : cost;
  const images = [
    ...absoluteUrls(row.images),
    ...absoluteUrls([row.featured_image, row.image]),
  ];
  return {
    partnerId: str(row.id),
    code: str(row.code),
    name,
    slug: str(row.slug),
    category: str(row.category),
    image: images[0] ?? null,
    customerPrice: customer,
    costPrice: cost,
    inStock: row.in_stock !== false,
  };
}

/** Partner catalog as the import screen sees it (price fields already resolved). */
export async function getPartnerCatalogSnapshot(opts?: {
  refresh?: boolean;
}): Promise<CatalogSnapshot> {
  const { rows, loadedAt, cached } = await loadCatalogRows(opts);
  return {
    loadedAt: new Date(loadedAt).toISOString(),
    cached,
    rows: rows.map(previewRow).filter((r): r is CatalogPreviewRow => r !== null),
  };
}

/** Slug/SKU collision helpers — the DB has UNIQUE on both. */
async function uniqueValue(
  candidate: string,
  exists: (value: string) => Promise<boolean>
): Promise<string> {
  let value = candidate;
  for (let i = 2; i < 50; i++) {
    if (!(await exists(value))) return value;
    value = appendSuffix(candidate, i);
  }
  return `${candidate}-${Date.now()}`;
}

export interface ImportPartnerOptions {
  /**
   * Partner ids (`id`) and/or codes (`code`) to import. Empty/omitted means
   * the whole catalog. Rows outside the selection are left untouched.
   */
  only?: string[];
  /** Bypass the short-lived catalog cache and pull the partner again. */
  refresh?: boolean;
}

export async function importPartnerCatalog(
  options?: ImportPartnerOptions
): Promise<CatalogImportSummary> {
  const started = Date.now();
  const { rows: catalog } = await loadCatalogRows({ refresh: options?.refresh });

  const onlyList = (options?.only ?? [])
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
  const only = onlyList.length ? new Set(onlyList) : null;
  const selectedRows = only
    ? catalog.filter((row) => {
        const id = str(row.id);
        const code = str(row.code);
        return (id !== null && only.has(id)) || (code !== null && only.has(code));
      })
    : catalog;

  const summary: CatalogImportSummary = {
    fetched: catalog.length,
    selected: selectedRows.length,
    created: 0,
    updated: 0,
    skipped: 0,
    categoriesCreated: 0,
    missingFromPartner: 0,
    errors: [],
    durationMs: 0,
  };

  if (only && onlyList.length && selectedRows.length === 0) {
    summary.errors.push("None of the selected products were found in the partner catalog");
    summary.durationMs = Date.now() - started;
    return summary;
  }

  const categories = await prisma.category.findMany({
    select: { id: true, name: true, slug: true },
  });
  const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
  const categorySlugs = new Set(categories.map((c) => c.slug));

  const resolveCategory = async (rawName: string | null): Promise<string> => {
    const name = rawName?.trim() || "Uncategorised";
    const hit = byName.get(name.toLowerCase());
    if (hit) return hit;

    let slug = slugify(name);
    while (categorySlugs.has(slug)) slug = appendSuffix(slug, categorySlugs.size + 1);
    categorySlugs.add(slug);

    const created = await prisma.category.create({
      data: { name, slug, isActive: true, showInMenu: true, position: categories.length },
      select: { id: true },
    });
    byName.set(name.toLowerCase(), created.id);
    categories.push({ id: created.id, name, slug });
    summary.categoriesCreated += 1;
    return created.id;
  };

  const partnerIds: string[] = [];

  for (const [index, raw] of selectedRows.entries()) {
    const row = raw as PartnerProduct;
    const title = str(row.title);
    const partnerId = str(row.id);
    const code = str(row.code);
    let productId: string | null = null;

    if (partnerId) partnerIds.push(partnerId);

    if (!title) {
      summary.skipped += 1;
      summary.errors.push(`#${index + 1}: missing title — skipped`);
      continue;
    }

    try {
      const categoryId = await resolveCategory(str(row.category));

      const or: Prisma.ProductWhereInput[] = [];
      if (partnerId) or.push({ externalProductId: partnerId });
      if (code) or.push({ sku: code });
      if (str(row.slug)) or.push({ slug: str(row.slug)! });

      const existing = or.length
        ? await prisma.product.findFirst({ where: { OR: or }, select: {
            id: true, slug: true, sku: true, status: true, brandId: true,
            isFeatured: true, isBestseller: true, newArrival: true, isDeal: true,
            colors: true, sizes: true,
          } })
        : null;

      // What WE pay the partner — their `price` equals `reseller_price`.
      const cost = num(row.reseller_price) ?? num(row.price);
      const regular = num(row.regular_price);
      if (cost === null) {
        summary.skipped += 1;
        summary.errors.push(`"${title}": no usable price — skipped`);
        continue;
      }
      // What OUR customer pays: the partner's regular price, never below cost.
      const customer = regular !== null && regular > cost ? regular : cost;

      const slugBase = slugify(str(row.slug) || title);
      const skuBase = code || (partnerId ? `EXT-${partnerId.slice(0, 12)}` : slugBase.toUpperCase());

      const slug = existing
        ? existing.slug
        : await uniqueValue(slugBase, async (v) =>
            Boolean(await prisma.product.findUnique({ where: { slug: v }, select: { id: true } }))
          );
      const sku = existing
        ? existing.sku
        : await uniqueValue(skuBase, async (v) =>
            Boolean(await prisma.product.findUnique({ where: { sku: v }, select: { id: true } }))
          );

      const images = [
        ...absoluteUrls(row.images),
        ...absoluteUrls([row.featured_image, row.image]),
      ].filter((url, i, arr) => arr.indexOf(url) === i);

      const imageRows = images.map((url, i) => ({
        url,
        alt: `${title}${i > 0 ? ` — photo ${i + 1}` : ""}`,
        position: i,
      }));

      const data: Prisma.ProductCreateInput = {
        name: title,
        slug,
        sku,
        shortDescription: str(row.short_description),
        description: str(row.description),
        category: { connect: { id: categoryId } },
        price: customer,
        costPrice: cost,
        compareAtPrice: null,
        discountPercent: 0,
        stock: row.in_stock === false ? 0 : STOCK_WHEN_IN_STOCK,
        colors: stringArray(row.colors) ? JSON.stringify(stringArray(row.colors)) : undefined,
        sizes: stringArray(row.sizes) ? JSON.stringify(stringArray(row.sizes)) : undefined,
        externalProductId: partnerId ?? undefined,
        externalSku: code ?? undefined,
        ...(imageRows.length ? { images: { create: imageRows } } : {}),
      };

      if (existing) {
        // Re-import: refresh catalog facts, keep the admin's own choices.
        const update: Prisma.ProductUpdateInput = {
          name: title,
          shortDescription: str(row.short_description),
          description: str(row.description),
          category: { connect: { id: categoryId } },
          price: customer,
          costPrice: cost,
          compareAtPrice: null,
          discountPercent: 0,
          stock: row.in_stock === false ? 0 : STOCK_WHEN_IN_STOCK,
          colors: stringArray(row.colors) ? JSON.stringify(stringArray(row.colors)) : undefined,
          sizes: stringArray(row.sizes) ? JSON.stringify(stringArray(row.sizes)) : undefined,
          externalProductId: partnerId ?? undefined,
          externalSku: code ?? undefined,
        };
        if (imageRows.length) update.images = { deleteMany: {}, create: imageRows };
        const saved = await prisma.product.update({
          where: { id: existing.id },
          data: update,
          select: { id: true },
        });
        productId = saved.id;
        summary.updated += 1;
      } else {
        const saved = await prisma.product.create({ data, select: { id: true } });
        productId = saved.id;
        summary.created += 1;
      }

      // Order push reads Product→external mapping (not Product.externalProductId),
      // so keep the mapping row in sync — that is what fills items[].productId.
      if (productId && partnerId) {
        await prisma.externalProductMapping.upsert({
          where: { productId },
          update: { externalId: partnerId, externalSku: code, lastSyncedAt: new Date() },
          create: { productId, externalId: partnerId, externalSku: code, lastSyncedAt: new Date() },
        });
      }
    } catch (err) {
      summary.skipped += 1;
      summary.errors.push(`"${title}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Only meaningful for a full pull — a selection simply did not look at the
  // rest of the catalog, so reporting them as "missing" would be a lie.
  if (!only && partnerIds.length) {
    summary.missingFromPartner = await prisma.product.count({
      where: { externalProductId: { not: null, notIn: partnerIds } },
    });
  }

  summary.durationMs = Date.now() - started;
  return summary;
}
