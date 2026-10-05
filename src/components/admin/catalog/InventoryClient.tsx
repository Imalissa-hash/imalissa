"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Package } from "lucide-react";
import { Panel, Table, Th, Td, Empty, SearchInput, Tabs, Modal, Field, TextInput, BusyBtn } from "@/components/admin/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Pagination } from "@/components/ui/Pagination";
import { formatBDT } from "@/lib/utils";

export interface InventoryVariant {
  id: string;
  sku: string;
  color: string | null;
  size: string | null;
  label: string | null;
  stock: number;
  price: number | null;
}

export interface InventoryRow {
  id: string;
  name: string;
  sku: string;
  status: string;
  stock: number;
  lowStockThreshold: number;
  image: string | null;
  variantCount: number;
  variants: InventoryVariant[];
}

export interface InventoryCounts {
  all: number;
  low: number;
  out: number;
}

const pillFor = (stock: number, threshold: number) =>
  stock <= 0 ? "OUT" : stock <= threshold ? "LOW" : "IN_STOCK";

export function InventoryClient({
  items,
  total,
  totalPages,
  page,
  counts,
  searchParams,
}: {
  items: InventoryRow[];
  total: number;
  totalPages: number;
  page: number;
  counts: InventoryCounts;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const router = useRouter();
  const get = (k: string) => {
    const v = searchParams[k];
    return typeof v === "string" ? v : "";
  };

  const urlQ = get("q");
  const stock = get("stock") === "low" || get("stock") === "out" ? get("stock") : "";

  const [q, setQ] = useState(urlQ);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [adjusted, setAdjusted] = useState<Record<string, number>>({});

  // Adjust modal
  const [target, setTarget] = useState<{ row: InventoryRow; variant: InventoryVariant | null } | null>(null);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [adjustErr, setAdjustErr] = useState<string | null>(null);
  const [adjustBusy, setAdjustBusy] = useState(false);

  // Server data supersedes optimistic values once it arrives.
  useEffect(() => {
    setAdjusted({});
  }, [items]);

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
    router.push(`/admin/inventory${qs ? `?${qs}` : ""}`);
  };

  useEffect(() => {
    const t = setTimeout(() => {
      const next = q.trim();
      if (next !== urlQ) push({ q: next || null });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const toggleRow = (id: string) =>
    setExpanded((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const shownStock = (row: InventoryRow, variant?: InventoryVariant) => {
    const key = `${row.id}:${variant?.id ?? ""}`;
    return adjusted[key] ?? (variant ? variant.stock : row.stock);
  };

  const openAdjust = (row: InventoryRow, variant: InventoryVariant | null) => {
    setTarget({ row, variant });
    setDelta("");
    setReason("");
    setAdjustErr(null);
  };

  const deltaNum = Number(delta) || 0;
  const current = target ? shownStock(target.row, target.variant ?? undefined) : 0;
  const after = current + deltaNum;

  const submitAdjust = async () => {
    if (!target || adjustBusy) return;
    if (!Number.isInteger(deltaNum) || deltaNum === 0) {
      setAdjustErr("Enter a non-zero whole number (use −5 to remove 5)");
      return;
    }
    if (after < 0) {
      setAdjustErr(`Cannot go below 0 — current stock is ${current}`);
      return;
    }
    if (reason.trim().length < 2) {
      setAdjustErr("Provide a reason for the adjustment");
      return;
    }

    setAdjustBusy(true);
    setAdjustErr(null);
    try {
      const res = await fetch("/api/admin/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: target.row.id,
          variantId: target.variant?.id ?? null,
          delta: deltaNum,
          reason: reason.trim(),
        }),
      });
      const json = await res.json().catch(() => ({ ok: false }));
      if (!json.ok) {
        setAdjustErr(json.message ?? "Could not adjust stock");
        return;
      }
      const key = `${target.row.id}:${target.variant?.id ?? ""}`;
      const balance: number = json.data?.balanceAfter ?? after;
      setAdjusted((prev) => ({ ...prev, [key]: balance }));
      setTarget(null);
      router.refresh();
    } catch {
      setAdjustErr("Network error — please try again");
    } finally {
      setAdjustBusy(false);
    }
  };

  const hasFilters = Boolean(urlQ || stock);

  return (
    <div>
      <Panel padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] p-5">
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder="Search product name or SKU…"
            className="w-full sm:w-72"
          />
          <Tabs
            tabs={[
              { key: "", label: "All", count: counts.all },
              { key: "low", label: "Low", count: counts.low },
              { key: "out", label: "Out", count: counts.out },
            ]}
            active={stock}
            onChange={(key) => push({ stock: key || null })}
          />
        </div>

        {items.length === 0 ? (
          <div className="p-5">
            <Empty
              title={hasFilters ? "No products match this view" : "No products yet"}
              hint={
                hasFilters
                  ? "Try a different search, or switch the filter tab."
                  : "Add products to start tracking inventory."
              }
            />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>SKU</Th>
                <Th>Status</Th>
                <Th>Stock</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const isOpen = expanded.includes(row.id);
                const productStock = shownStock(row);
                return (
                  <Fragment key={row.id}>
                    <tr className="transition hover:bg-white/[0.02]">
                      <Td>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => toggleRow(row.id)}
                            aria-label={isOpen ? "Collapse variants" : "Expand variants"}
                            className={`shrink-0 rounded-lg p-1 text-mist-500 transition hover:text-gold-300 ${
                              row.variantCount === 0 ? "invisible" : ""
                            }`}
                          >
                            {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          </button>
                          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
                            {row.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={row.image} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                <Package size={14} className="text-mist-600" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-mist-100">{row.name}</p>
                            <p className="text-[0.74rem] text-mist-600">
                              {row.variantCount > 0
                                ? `${row.variantCount} variant${row.variantCount === 1 ? "" : "s"} · base row`
                                : "No variants"}
                            </p>
                          </div>
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap text-mist-500">{row.sku}</Td>
                      <Td>
                        <StatusBadge status={pillFor(productStock, row.lowStockThreshold)} />
                      </Td>
                      <Td className="whitespace-nowrap">
                        <span className="font-display font-semibold text-mist-100">{productStock}</span>
                        <span className="ml-1.5 text-[0.74rem] text-mist-600">
                          / min {row.lowStockThreshold}
                        </span>
                      </Td>
                      <Td className="text-right">
                        <button
                          onClick={() => openAdjust(row, null)}
                          className="rounded-lg border border-white/12 px-3 py-1.5 text-[0.78rem] font-semibold text-mist-300 transition hover:border-gold-500/40 hover:text-gold-300"
                        >
                          Adjust
                        </button>
                      </Td>
                    </tr>

                    {isOpen &&
                      row.variants.map((v) => {
                        const vStock = shownStock(row, v);
                        return (
                          <tr key={v.id} className="bg-white/[0.015] transition hover:bg-white/[0.03]">
                            <Td>
                              <div className="flex items-center gap-3 pl-11">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-gold-500/25 bg-gold-500/[0.08] text-[0.62rem] font-bold text-gold-400">
                                  V
                                </span>
                                <div className="min-w-0">
                                  <p className="truncate text-[0.86rem] text-mist-200">
                                    {v.label ?? "Partial variant"}
                                  </p>
                                  {v.price !== null && (
                                    <p className="text-[0.72rem] text-mist-600">
                                      {formatBDT(v.price)} each
                                    </p>
                                  )}
                                </div>
                              </div>
                            </Td>
                            <Td className="whitespace-nowrap text-mist-500">{v.sku}</Td>
                            <Td>
                              <StatusBadge status={pillFor(vStock, row.lowStockThreshold)} />
                            </Td>
                            <Td className="whitespace-nowrap">
                              <span className="font-display font-semibold text-mist-200">{vStock}</span>
                              <span className="ml-1.5 text-[0.74rem] text-mist-600">
                                / min {row.lowStockThreshold}
                              </span>
                            </Td>
                            <Td className="text-right">
                              <button
                                onClick={() => openAdjust(row, v)}
                                className="rounded-lg border border-white/12 px-3 py-1.5 text-[0.78rem] font-semibold text-mist-300 transition hover:border-gold-500/40 hover:text-gold-300"
                              >
                                Adjust
                              </button>
                            </Td>
                          </tr>
                        );
                      })}
                  </Fragment>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>

      <Pagination
        page={page}
        totalPages={totalPages}
        basePath="/admin/inventory"
        searchParams={searchParams}
      />

      {/* Adjust modal */}
      <Modal
        open={target !== null}
        onClose={() => (adjustBusy ? undefined : setTarget(null))}
        title="Adjust stock"
      >
        {target && (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-[0.86rem] text-mist-300">
              <p className="font-semibold text-mist-100">{target.row.name}</p>
              <p className="text-[0.78rem] text-mist-600">
                {target.variant
                  ? `Variant: ${target.variant.label ?? "partial"} · ${target.variant.sku}`
                  : `Base row · ${target.row.sku}`}
              </p>
            </div>

            {adjustErr && (
              <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-[0.84rem] text-danger">
                {adjustErr}
              </div>
            )}

            <Field
              label="Change"
              hint="Positive adds stock, negative removes it (e.g. −3 for damage)."
            >
              <TextInput
                type="number"
                step={1}
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
                placeholder="-3"
              />
            </Field>

            <Field label="Reason">
              <TextInput
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Restock received / damage / stock count correction"
                maxLength={200}
              />
            </Field>

            <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
              <span className="text-[0.82rem] text-mist-500">
                Current <strong className="font-display text-mist-100">{current}</strong>
              </span>
              <span
                className={`text-[0.82rem] ${
                  after < 0 ? "text-danger" : after <= target.row.lowStockThreshold ? "text-amber-400" : "text-success"
                }`}
              >
                After change <strong className="font-display">{after}</strong>
              </span>
            </div>

            <div className="flex justify-end gap-3 border-t border-white/[0.07] pt-4">
              <button
                type="button"
                onClick={() => setTarget(null)}
                disabled={adjustBusy}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/12 px-4 py-2.5 text-[0.84rem] font-semibold text-mist-300 transition hover:border-gold-500/40 hover:text-gold-300 disabled:opacity-50"
              >
                Cancel
              </button>
              <BusyBtn busy={adjustBusy} onClick={submitAdjust}>
                Apply change
              </BusyBtn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
