import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import {
  ImportClient,
  type ImportLocal,
  type ImportRow,
} from "@/components/admin/catalog/ImportClient";
import {
  getPartnerCatalogSnapshot,
  type CatalogSnapshot,
} from "@/server/external-commerce/catalog";
import { ExternalCommerceError } from "@/server/external-commerce/errors";

export const metadata: Metadata = {
  title: "Import from partner",
  robots: { index: false, follow: false },
};

// Partner catalog + our import status are live data — never prerendered.
export const dynamic = "force-dynamic";

interface LocalProduct {
  id: string;
  name: string;
  status: string;
  /** Prisma Decimal — converted with Number() below. */
  price: unknown;
  externalProductId: string | null;
  externalSku: string | null;
}

/**
 * Dedicated import screen: the partner catalog as a browsable list so the
 * admin can LOOK at each product and import one by one (or in any selection)
 * instead of pulling all 128 at once.
 *
 * Prices shown here are exactly what an import would write:
 *   customer price → partner `regular_price` (what the storefront charges)
 *   cost           → partner `reseller_price` (what we pay, admin only)
 */
export default async function AdminImportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const refresh = sp.refresh === "1" || sp.refresh === "true";

  let snapshot: CatalogSnapshot | null = null;
  let error: string | null = null;
  try {
    snapshot = await getPartnerCatalogSnapshot({ refresh });
  } catch (err) {
    error =
      err instanceof ExternalCommerceError
        ? err.message
        : "Could not load the partner catalog. Please try again.";
  }

  const locals: LocalProduct[] = snapshot
    ? await prisma.product.findMany({
        where: {
          OR: [{ externalProductId: { not: null } }, { externalSku: { not: null } }],
        },
        select: {
          id: true,
          name: true,
          status: true,
          price: true,
          externalProductId: true,
          externalSku: true,
        },
      })
    : [];

  const byId = new Map<string, ImportLocal>();
  const bySku = new Map<string, ImportLocal>();
  const toLocal = (p: LocalProduct): ImportLocal => ({
    id: p.id,
    status: p.status,
    price: Number(p.price),
  });
  for (const p of locals) {
    if (p.externalProductId) byId.set(p.externalProductId, toLocal(p));
    if (p.externalSku) bySku.set(p.externalSku, toLocal(p));
  }

  const rows: ImportRow[] = (snapshot?.rows ?? []).map((r) => {
    const local =
      (r.partnerId ? byId.get(r.partnerId) : undefined) ??
      (r.code ? bySku.get(r.code) : undefined) ??
      null;
    return {
      // What the import API selects on: partner id first, their SKU second.
      key: r.partnerId ?? r.code ?? "",
      partnerId: r.partnerId,
      code: r.code,
      name: r.name,
      slug: r.slug,
      category: r.category,
      image: r.image,
      customerPrice: r.customerPrice,
      costPrice: r.costPrice,
      inStock: r.inStock,
      local,
    };
  });

  return (
    <div>
      <AdminPageHeader
        title="Import from partner"
        subtitle={
          snapshot
            ? `${rows.length} product${rows.length === 1 ? "" : "s"} in the partner catalog — pick exactly what to import`
            : "Partner catalog"
        }
        action={
          <div className="flex items-center gap-3">
            <Link
              href="/admin/products"
              className="btn-gold flex items-center gap-2 rounded-xl px-4 py-2.5 text-[0.84rem]"
            >
              Back to products
            </Link>
          </div>
        }
      />
      <ImportClient
        rows={rows}
        loadedAt={snapshot?.loadedAt ?? null}
        cached={snapshot?.cached ?? false}
        error={error}
      />
    </div>
  );
}
