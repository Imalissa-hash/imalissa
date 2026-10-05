import { NextRequest } from "next/server";
import { clientIp, jsonOk, withApi } from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/admin-auth";
import { badRequest } from "@/lib/errors";
import { importPartnerCatalog, type CatalogImportSummary } from "@/server/external-commerce/catalog";
import { ExternalCommerceError } from "@/server/external-commerce/errors";

/**
 * POST /api/admin/import
 *
 * Pulls the partner catalog (GET {base}/products) and upserts it into our
 * products. Admin-only. Reports the REAL numbers — created/updated/skipped —
 * and surfaces partner/auth failures instead of pretending they worked.
 *
 * Body (all optional):
 *   { codes?: string[] }  → import only these partner ids/codes
 *   { refresh?: true }    → re-download the catalog instead of using the
 *                           short-lived cache from the import screen
 */
export const POST = withApi(async (req: NextRequest) => {
  const admin = await requireAdmin();

  const body = (await req.json().catch(() => null)) as {
    codes?: unknown;
    refresh?: unknown;
  } | null;

  let only: string[] | undefined;
  if (Array.isArray(body?.codes)) {
    only = body.codes
      .filter((c): c is string => typeof c === "string")
      .map((c) => c.trim())
      .filter(Boolean);
    if (body.codes.length > 0 && only.length === 0) {
      throw badRequest("No valid products were selected for import.");
    }
    if (only.length > 500) {
      throw badRequest("Too many products in one request (max 500).");
    }
  }

  let summary: CatalogImportSummary;
  try {
    summary = await importPartnerCatalog({
      only,
      refresh: body?.refresh === true,
    });
  } catch (err) {
    if (err instanceof ExternalCommerceError) throw badRequest(err.message);
    throw err;
  }

  await audit({
    adminId: admin.id,
    action: "CATALOG_IMPORT",
    entityType: "Product",
    details: {
      fetched: summary.fetched,
      selected: summary.selected,
      created: summary.created,
      updated: summary.updated,
      skipped: summary.skipped,
      categoriesCreated: summary.categoriesCreated,
      failed: summary.errors.length,
      durationMs: summary.durationMs,
    },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk(summary);
});
