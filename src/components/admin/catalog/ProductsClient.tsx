"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Package, Pencil, Trash2, X } from "lucide-react";
import {
  Panel,
  Table,
  Th,
  Td,
  Empty,
  SearchInput,
  Select,
  ConfirmDialog,
} from "@/components/admin/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Pagination } from "@/components/ui/Pagination";
import { formatBDT } from "@/lib/utils";

/** One product row — server-serialized (Decimals already converted to numbers). */
export interface ProductRow {
  id: string;
  name: string;
  slug: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  discountPercent: number;
  salePrice: number;
  stock: number;
  lowStockThreshold: number;
  status: string;
  isFeatured: boolean;
  isBestseller: boolean;
  newArrival: boolean;
  isDeal: boolean;
  image: string | null;
  categoryName: string;
  brandName: string | null;
}

export interface ProductFacets {
  categories: { id: string; name: string; count: number }[];
  brands: { id: string; name: string }[];
}

const stockStatus = (p: ProductRow) =>
  p.stock <= 0 ? "OUT" : p.stock <= p.lowStockThreshold ? "LOW" : "IN_STOCK";

export function ProductsClient({
  items,
  total,
  totalPages,
  page,
  facets,
  searchParams,
}: {
  items: ProductRow[];
  total: number;
  totalPages: number;
  page: number;
  facets: ProductFacets;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const router = useRouter();
  const get = (k: string) => {
    const v = searchParams[k];
    return typeof v === "string" ? v : "";
  };

  const status = get("status");
  const categoryId = get("categoryId");
  const brandId = get("brandId");
  const stock = get("stock");
  const sort = get("sort") || "newest";
  const urlQ = get("q");

  const [q, setQ] = useState(urlQ);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ProductRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  /** Navigate with merged filter changes (always resets to page 1). */
  const push = (patch: Record<string, string | null>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (typeof v === "string") sp.set(k, v);
      else if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
    }
    sp.delete("page");
    for (const [k, v] of Object.entries(patch)) {
      if (!v) sp.delete(k);
      else sp.set(k, v);
    }
    const qs = sp.toString();
    router.push(`/admin/products${qs ? `?${qs}` : ""}`);
  };

  // Debounced search → server navigation.
  useEffect(() => {
    const t = setTimeout(() => {
      const next = q.trim();
      if (next !== urlQ) push({ q: next || null });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const toggleStatus = async (p: ProductRow) => {
    const next = p.status === "ACTIVE" ? "DRAFT" : "ACTIVE";
    setBusyId(p.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/products/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const json = await res.json().catch(() => ({ ok: false }));
      if (!json.ok) setError(json.message ?? "Could not update the status");
      else router.refresh();
    } catch {
      setError("Network error — please try again");
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/products/${deleting.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({ ok: false }));
      setDeleting(null);
      if (!json.ok) setError(json.message ?? "Could not delete the product");
      else router.refresh();
    } catch {
      setDeleting(null);
      setError("Network error — please try again");
    } finally {
      setDeleteBusy(false);
    }
  };

  const renderFlags = (p: ProductRow) => {
    const flags = [
      p.isFeatured && "Featured",
      p.isBestseller && "Bestseller",
      p.newArrival && "New",
      p.isDeal && "Deal",
    ].filter(Boolean) as string[];
    if (!flags.length) return <span className="text-mist-600">—</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {flags.map((f) => (
          <span
            key={f}
            className="rounded-full border border-gold-500/30 bg-gold-500/[0.08] px-2 py-0.5 text-[0.64rem] font-semibold uppercase tracking-wide text-gold-300"
          >
            {f}
          </span>
        ))}
      </div>
    );
  };

  const hasFilters = Boolean(urlQ || status || categoryId || brandId || stock);

  return (
    <div>
      {error && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-[0.84rem] text-danger">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss" className="shrink-0">
            <X size={14} />
          </button>
        </div>
      )}

      <Panel padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.07] p-5">
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder="Search name or SKU…"
            className="w-full sm:w-72"
          />
          <Select value={status} onChange={(e) => push({ status: e.target.value })} className="sm:w-40">
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="DRAFT">Draft</option>
            <option value="ARCHIVED">Archived</option>
          </Select>
          <Select
            value={categoryId}
            onChange={(e) => push({ categoryId: e.target.value })}
            className="sm:w-52"
          >
            <option value="">All categories ({facets.categories.reduce((s, c) => s + c.count, 0)})</option>
            {facets.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.count})
              </option>
            ))}
          </Select>
          <Select value={brandId} onChange={(e) => push({ brandId: e.target.value })} className="sm:w-44">
            <option value="">All brands</option>
            {facets.brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
          <Select value={stock} onChange={(e) => push({ stock: e.target.value })} className="sm:w-40">
            <option value="">Any stock</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </Select>
          <Select value={sort} onChange={(e) => push({ sort: e.target.value })} className="sm:w-48">
            <option value="newest">Newest first</option>
            <option value="price_asc">Price: low → high</option>
            <option value="price_desc">Price: high → low</option>
            <option value="name">Name A–Z</option>
            <option value="stock">Stock: low first</option>
          </Select>
        </div>

        {items.length === 0 ? (
          <div className="p-5">
            <Empty
              title={hasFilters ? "No products match your filters" : "No products yet"}
              hint={
                hasFilters
                  ? "Try a different search term, or clear the filters above."
                  : "Add your first product to start building the catalog."
              }
            />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>Category</Th>
                <Th className="text-right">Price</Th>
                <Th>Stock</Th>
                <Th>Status</Th>
                <Th>Flags</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => {
                const effective = p.discountPercent > 0 ? p.salePrice : p.price;
                return (
                  <tr key={p.id} className="transition hover:bg-white/[0.02]">
                    <Td>
                      <div className="flex items-center gap-3">
                        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                          {p.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.image} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <Package size={16} className="text-mist-600" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={`/admin/products/${p.id}`}
                            className="block max-w-[22ch] truncate font-semibold text-mist-100 transition hover:text-gold-300 sm:max-w-none"
                          >
                            {p.name}
                          </Link>
                          <p className="text-[0.74rem] text-mist-600">
                            {p.sku}
                            {p.brandName ? ` · ${p.brandName}` : ""}
                          </p>
                        </div>
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap">{p.categoryName}</Td>
                    <Td className="whitespace-nowrap text-right">
                      <span className="font-display font-semibold text-gold-300">
                        {formatBDT(effective)}
                      </span>
                      {p.compareAtPrice !== null && p.compareAtPrice > effective && (
                        <span className="ml-1.5 text-[0.74rem] text-mist-600 line-through">
                          {formatBDT(p.compareAtPrice)}
                        </span>
                      )}
                    </Td>
                    <Td>
                      <div className="flex flex-col gap-1">
                        <StatusBadge status={stockStatus(p)} />
                        <span className="text-[0.7rem] text-mist-600">
                          {p.stock} units · min {p.lowStockThreshold}
                        </span>
                      </div>
                    </Td>
                    <Td>
                      <StatusBadge status={p.status} />
                    </Td>
                    <Td>{renderFlags(p)}</Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/admin/products/${p.id}`}
                          aria-label={`Edit ${p.name}`}
                          title="Edit"
                          className="rounded-lg p-2 text-mist-500 transition hover:bg-white/[0.06] hover:text-gold-300"
                        >
                          <Pencil size={14} />
                        </Link>
                        <button
                          onClick={() => toggleStatus(p)}
                          disabled={busyId === p.id}
                          className="rounded-lg px-2 py-1.5 text-[0.74rem] text-mist-500 transition hover:bg-white/[0.06] hover:text-gold-300 disabled:opacity-50"
                        >
                          {busyId === p.id ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : p.status === "ACTIVE" ? (
                            "Deactivate"
                          ) : (
                            "Activate"
                          )}
                        </button>
                        <button
                          onClick={() => setDeleting(p)}
                          aria-label={`Delete ${p.name}`}
                          title="Delete"
                          className="rounded-lg p-2 text-mist-500 transition hover:bg-danger/10 hover:text-danger"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>

      <Pagination
        page={page}
        totalPages={totalPages}
        basePath="/admin/products"
        searchParams={searchParams}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Delete product"
        message={`Delete “${deleting?.name ?? ""}” permanently? Its images and variants are removed too. Products referenced by orders cannot be deleted — you will be asked to archive instead.`}
        confirmLabel="Delete"
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
