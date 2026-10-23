"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, ClipboardList, Package, Pencil, Plus } from "lucide-react";
import {
  Panel,
  Table,
  Th,
  Td,
  Empty,
  SearchInput,
  Tabs,
  Modal,
  Field,
  TextInput,
  Select,
  BusyBtn,
} from "@/components/admin/ui";
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

/** Category choices for the quick-add form — the product API requires one. */
export interface CategoryChoice {
  id: string;
  name: string;
}

export interface ReorderItem {
  id: string;
  name: string;
  sku: string;
  stock: number;
  lowStockThreshold: number;
  variantCount: number;
  state: "OUT" | "LOW";
}

/** Reason recorded in the audit log for one-tap restocks, so the trail
 *  still says why stock moved rather than leaving a bare number. */
const QUICK_REASON = "Quick restock from inventory";

const pillFor = (stock: number, threshold: number) =>
  stock <= 0 ? "OUT" : stock <= threshold ? "LOW" : "IN_STOCK";

export function InventoryClient({
  items,
  total,
  totalPages,
  page,
  counts,
  searchParams,
  categories,
  reorderItems,
  reorderOverflow,
}: {
  items: InventoryRow[];
  total: number;
  totalPages: number;
  page: number;
  counts: InventoryCounts;
  searchParams: Record<string, string | string[] | undefined>;
  categories: CategoryChoice[];
  reorderItems: ReorderItem[];
  reorderOverflow: number;
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

  // Quick-add product modal
  const emptyAdd = { name: "", sku: "", categoryId: "", price: "", stock: "", threshold: "", status: "DRAFT" };
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState(emptyAdd);
  const [addErr, setAddErr] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  // Edit variant modal
  const [editTarget, setEditTarget] = useState<{ row: InventoryRow; variant: InventoryVariant } | null>(null);
  const [editForm, setEditForm] = useState({ sku: "", color: "", size: "", price: "" });
  const [editErr, setEditErr] = useState<string | null>(null);
  const [editBusy, setEditBusy] = useState(false);

  // Reorder panel
  const [reorderOpen, setReorderOpen] = useState(false);
  const [reorderTarget, setReorderTarget] = useState("20");
  const [copied, setCopied] = useState(false);

  // Row-level feedback for one-tap actions.
  const [notice, setNotice] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [quickBusy, setQuickBusy] = useState<string | null>(null);

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

  // ── One-tap restock ───────────────────────────────────────
  // Uses the same audited PATCH as the modal; only the reason is fixed.
  const quickRestock = async (row: InventoryRow, variant: InventoryVariant | null, amount: number) => {
    const key = `${row.id}:${variant?.id ?? ""}`;
    if (quickBusy) return;
    setQuickBusy(key);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: row.id,
          variantId: variant?.id ?? null,
          delta: amount,
          reason: QUICK_REASON,
        }),
      });
      const json = await res.json().catch(() => ({ ok: false }));
      if (!json.ok) {
        setNotice({ kind: "error", text: json.message ?? "Could not add stock" });
        return;
      }
      setAdjusted((prev) => ({ ...prev, [key]: json.data?.balanceAfter ?? (variant ? variant.stock : row.stock) + amount }));
      setNotice({
        kind: "ok",
        text: `+${amount} added to ${variant ? (variant.label ?? "variant") : row.name}`,
      });
      router.refresh();
    } catch {
      setNotice({ kind: "error", text: "Network error — please try again" });
    } finally {
      setQuickBusy(null);
    }
  };

  // ── Quick add product ─────────────────────────────────────
  const submitAdd = async () => {
    if (addBusy) return;
    setAddErr(null);

    const name = addForm.name.trim();
    const sku = addForm.sku.trim();
    const price = Number(addForm.price);
    const stock = addForm.stock === "" ? 0 : Number(addForm.stock);
    const threshold = addForm.threshold === "" ? 0 : Number(addForm.threshold);

    if (name.length < 2) return setAddErr("Name must be at least 2 characters");
    if (!sku) return setAddErr("SKU is required");
    if (!addForm.categoryId) return setAddErr("Choose a category");
    if (!Number.isFinite(price) || price < 0.01) return setAddErr("Price must be 0.01 or more");
    if (!Number.isInteger(stock) || stock < 0) return setAddErr("Stock must be a whole number of 0 or more");
    if (!Number.isInteger(threshold) || threshold < 0)
      return setAddErr("Low-stock threshold must be a whole number of 0 or more");

    setAddBusy(true);
    try {
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          sku,
          categoryId: addForm.categoryId,
          price,
          stock,
          lowStockThreshold: threshold,
          status: addForm.status,
        }),
      });
      const json = await res.json().catch(() => ({ ok: false }));
      if (!json.ok) {
        setAddErr(json.message ?? "Could not add the product");
        return;
      }
      setAdding(false);
      setAddForm(emptyAdd);
      setNotice({ kind: "ok", text: `${name} added` });
      router.refresh();
    } catch {
      setAddErr("Network error — please try again");
    } finally {
      setAddBusy(false);
    }
  };

  // ── Edit variant identity ─────────────────────────────────
  const openEdit = (row: InventoryRow, variant: InventoryVariant) => {
    setEditTarget({ row, variant });
    setEditForm({
      sku: variant.sku,
      color: variant.color ?? "",
      size: variant.size ?? "",
      price: variant.price === null ? "" : String(variant.price),
    });
    setEditErr(null);
  };

  const submitEdit = async () => {
    if (!editTarget || editBusy) return;
    setEditErr(null);

    const sku = editForm.sku.trim();
    if (!sku) return setEditErr("SKU is required");
    const priceRaw = editForm.price.trim();
    let price: number | null = null;
    if (priceRaw !== "") {
      price = Number(priceRaw);
      if (!Number.isFinite(price) || price < 0) return setEditErr("Price must be 0 or more");
    }

    setEditBusy(true);
    try {
      const res = await fetch("/api/admin/inventory/variant", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variantId: editTarget.variant.id,
          sku,
          color: editForm.color.trim(),
          size: editForm.size.trim(),
          price,
        }),
      });
      const json = await res.json().catch(() => ({ ok: false }));
      if (!json.ok) {
        setEditErr(json.message ?? "Could not save the variant");
        return;
      }
      setEditTarget(null);
      setNotice({ kind: "ok", text: "Variant updated" });
      router.refresh();
    } catch {
      setEditErr("Network error — please try again");
    } finally {
      setEditBusy(false);
    }
  };

  // ── Reorder list ──────────────────────────────────────────
  const reorderTargetNum = Math.max(0, Math.floor(Number(reorderTarget) || 0));
  const reorderLines = reorderItems
    .map((r) => ({ ...r, want: Math.max(0, reorderTargetNum - r.stock) }))
    .filter((r) => r.want > 0);

  const copyReorder = async () => {
    const lines = reorderLines.map(
      (r) => `${r.name} (${r.sku}) — have ${r.stock}, order ${r.want}`
    );
    const text = `Reorder list — target ${reorderTargetNum} each\n${lines.join("\n")}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice({ kind: "error", text: "Clipboard blocked — select the list and copy manually" });
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setReorderOpen(true);
                setCopied(false);
              }}
              disabled={reorderItems.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-3 py-1.5 text-[0.78rem] font-semibold text-mist-300 transition hover:border-gold-500/40 hover:text-gold-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ClipboardList size={14} />
              Reorder
              {reorderItems.length > 0 && (
                <span className="rounded-md bg-amber-500/15 px-1.5 text-[0.68rem] text-amber-300">
                  {reorderItems.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setAddForm(emptyAdd);
                setAddErr(null);
                setAdding(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gold-500 px-3 py-1.5 text-[0.78rem] font-semibold text-ink-950 transition hover:bg-gold-400"
            >
              <Plus size={14} />
              Add product
            </button>
          </div>
        </div>

        {notice && (
          <div
            role="status"
            className={`m-5 mb-0 rounded-xl px-4 py-3 text-[0.84rem] ${
              notice.kind === "error"
                ? "border border-danger/30 bg-danger/10 text-danger"
                : "border border-success/30 bg-success/10 text-success"
            }`}
          >
            {notice.text}
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="ml-3 underline opacity-70 hover:opacity-100"
            >
              dismiss
            </button>
          </div>
        )}

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
                        <div className="flex items-center justify-end gap-1.5">
                          {[5, 10].map((amt) => (
                            <button
                              key={amt}
                              type="button"
                              title={`Add ${amt} units`}
                              disabled={quickBusy === `${row.id}:`}
                              onClick={() => quickRestock(row, null, amt)}
                              className="rounded-lg border border-white/12 px-2 py-1.5 text-[0.74rem] font-semibold text-mist-400 transition hover:border-success/40 hover:text-success disabled:opacity-40"
                            >
                              +{amt}
                            </button>
                          ))}
                          <button
                            onClick={() => openAdjust(row, null)}
                            className="rounded-lg border border-white/12 px-3 py-1.5 text-[0.78rem] font-semibold text-mist-300 transition hover:border-gold-500/40 hover:text-gold-300"
                          >
                            Adjust
                          </button>
                        </div>
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
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  title="Add 5 units"
                                  disabled={quickBusy === `${row.id}:${v.id}`}
                                  onClick={() => quickRestock(row, v, 5)}
                                  className="rounded-lg border border-white/12 px-2 py-1.5 text-[0.74rem] font-semibold text-mist-400 transition hover:border-success/40 hover:text-success disabled:opacity-40"
                                >
                                  +5
                                </button>
                                <button
                                  type="button"
                                  title="Edit SKU, colour, size and price"
                                  onClick={() => openEdit(row, v)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-white/12 px-2 py-1.5 text-[0.74rem] font-semibold text-mist-400 transition hover:border-gold-500/40 hover:text-gold-300"
                                >
                                  <Pencil size={12} />
                                  Edit
                                </button>
                                <button
                                  onClick={() => openAdjust(row, v)}
                                  className="rounded-lg border border-white/12 px-3 py-1.5 text-[0.78rem] font-semibold text-mist-300 transition hover:border-gold-500/40 hover:text-gold-300"
                                >
                                  Adjust
                                </button>
                              </div>
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

      {/* Quick-add product */}
      <Modal open={adding} onClose={() => (addBusy ? undefined : setAdding(false))} title="Add product">
        <div className="space-y-4">
          <p className="text-[0.8rem] text-mist-600">
            Creates the product with its opening stock. Add images, description and variants later from
            Products → New.
          </p>

          {addErr && (
            <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-[0.84rem] text-danger">
              {addErr}
            </div>
          )}

          <Field label="Product name">
            <TextInput
              value={addForm.name}
              onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Cotton Panjabi"
              maxLength={200}
            />
          </Field>

          <Field label="SKU" hint="Must be unique across the catalogue.">
            <TextInput
              value={addForm.sku}
              onChange={(e) => setAddForm((f) => ({ ...f, sku: e.target.value }))}
              placeholder="e.g. PANJ-001"
              maxLength={64}
            />
          </Field>

          <Field label="Category">
            <Select
              value={addForm.categoryId}
              onChange={(e) => setAddForm((f) => ({ ...f, categoryId: e.target.value }))}
            >
              <option value="">Choose a category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            {categories.length === 0 && (
              <p className="mt-1.5 text-[0.74rem] text-amber-400">
                No active categories — create one in Categories first.
              </p>
            )}
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Price (৳)">
              <TextInput
                type="number"
                step="0.01"
                min={0}
                value={addForm.price}
                onChange={(e) => setAddForm((f) => ({ ...f, price: e.target.value }))}
                placeholder="0.00"
              />
            </Field>
            <Field label="Opening stock">
              <TextInput
                type="number"
                step={1}
                min={0}
                value={addForm.stock}
                onChange={(e) => setAddForm((f) => ({ ...f, stock: e.target.value }))}
                placeholder="0"
              />
            </Field>
            <Field label="Low-stock threshold" hint="Marks the row Low at or below this.">
              <TextInput
                type="number"
                step={1}
                min={0}
                value={addForm.threshold}
                onChange={(e) => setAddForm((f) => ({ ...f, threshold: e.target.value }))}
                placeholder="5"
              />
            </Field>
            <Field label="Status" hint="DRAFT stays off the storefront.">
              <Select
                value={addForm.status}
                onChange={(e) => setAddForm((f) => ({ ...f, status: e.target.value }))}
              >
                <option value="DRAFT">Draft</option>
                <option value="ACTIVE">Active</option>
              </Select>
            </Field>
          </div>

          <div className="flex justify-end gap-3 border-t border-white/[0.07] pt-4">
            <button
              type="button"
              onClick={() => setAdding(false)}
              disabled={addBusy}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/12 px-4 py-2.5 text-[0.84rem] font-semibold text-mist-300 transition hover:border-gold-500/40 hover:text-gold-300 disabled:opacity-50"
            >
              Cancel
            </button>
            <BusyBtn busy={addBusy} onClick={submitAdd}>
              Add product
            </BusyBtn>
          </div>
        </div>
      </Modal>

      {/* Edit variant */}
      <Modal open={editTarget !== null} onClose={() => (editBusy ? undefined : setEditTarget(null))} title="Edit variant">
        {editTarget && (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-[0.86rem] text-mist-300">
              <p className="font-semibold text-mist-100">{editTarget.row.name}</p>
              <p className="text-[0.78rem] text-mist-600">
                Stock is not editable here — use Adjust, which records the movement.
              </p>
            </div>

            {editErr && (
              <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-[0.84rem] text-danger">
                {editErr}
              </div>
            )}

            <Field label="SKU" hint="Must be unique across all variants.">
              <TextInput
                value={editForm.sku}
                onChange={(e) => setEditForm((f) => ({ ...f, sku: e.target.value }))}
                maxLength={64}
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Colour">
                <TextInput
                  value={editForm.color}
                  onChange={(e) => setEditForm((f) => ({ ...f, color: e.target.value }))}
                  placeholder="Navy"
                  maxLength={64}
                />
              </Field>
              <Field label="Size">
                <TextInput
                  value={editForm.size}
                  onChange={(e) => setEditForm((f) => ({ ...f, size: e.target.value }))}
                  placeholder="L"
                  maxLength={32}
                />
              </Field>
            </div>

            <Field label="Price override (৳)" hint="Leave blank to fall back to the product price.">
              <TextInput
                type="number"
                step="0.01"
                min={0}
                value={editForm.price}
                onChange={(e) => setEditForm((f) => ({ ...f, price: e.target.value }))}
                placeholder="Same as product"
              />
            </Field>

            <div className="flex justify-end gap-3 border-t border-white/[0.07] pt-4">
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                disabled={editBusy}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/12 px-4 py-2.5 text-[0.84rem] font-semibold text-mist-300 transition hover:border-gold-500/40 hover:text-gold-300 disabled:opacity-50"
              >
                Cancel
              </button>
              <BusyBtn busy={editBusy} onClick={submitEdit}>
                Save changes
              </BusyBtn>
            </div>
          </div>
        )}
      </Modal>

      {/* Reorder list */}
      <Modal open={reorderOpen} onClose={() => setReorderOpen(false)} title="Reorder list">
        <div className="space-y-4">
          <Field label="Target stock per product" hint="How many units you want on hand for each item below.">
            <TextInput
              type="number"
              step={1}
              min={0}
              value={reorderTarget}
              onChange={(e) => {
                setReorderTarget(e.target.value);
                setCopied(false);
              }}
            />
          </Field>

          {reorderItems.length === 0 ? (
            <Empty title="Nothing to reorder" hint="Every product is above its low-stock threshold." />
          ) : reorderLines.length === 0 ? (
            <Empty
              title="Nothing below your target"
              hint={`All ${reorderItems.length} flagged items already hold at least ${reorderTargetNum} units. Lower the target to see suggestions.`}
            />
          ) : (
            <>
              <Table>
                <thead>
                  <tr>
                    <Th>Product</Th>
                    <Th className="text-right">Have</Th>
                    <Th className="text-right">Order</Th>
                  </tr>
                </thead>
                <tbody>
                  {reorderLines.map((r) => (
                    <tr key={r.id} className="transition hover:bg-white/[0.02]">
                      <Td>
                        <p className="truncate font-semibold text-mist-100">
                          {r.state === "OUT" && (
                            <span className="mr-1.5 rounded bg-danger/15 px-1.5 py-0.5 text-[0.62rem] font-bold text-danger">
                              OUT
                            </span>
                          )}
                          {r.name}
                        </p>
                        <p className="text-[0.72rem] text-mist-600">{r.sku}</p>
                      </Td>
                      <Td className="text-right whitespace-nowrap text-mist-500">{r.stock}</Td>
                      <Td className="text-right whitespace-nowrap font-display font-semibold text-gold-300">
                        {r.want}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>

              <p className="text-[0.76rem] text-mist-600">
                {reorderLines.length} item{reorderLines.length === 1 ? "" : "s"} to order at target{" "}
                {reorderTargetNum}. This is a calculation to help you buy — nothing is ordered or sent
                automatically.
              </p>

              <div className="flex items-center justify-between gap-3 border-t border-white/[0.07] pt-4">
                <button
                  type="button"
                  onClick={() => setReorderOpen(false)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/12 px-4 py-2.5 text-[0.84rem] font-semibold text-mist-300 transition hover:border-gold-500/40 hover:text-gold-300"
                >
                  Close
                </button>
                <BusyBtn busy={false} onClick={copyReorder}>
                  {copied ? "Copied ✓" : "Copy list"}
                </BusyBtn>
              </div>
            </>
          )}

          {reorderOverflow > 0 && (
            <p className="text-[0.76rem] text-amber-400">
              Showing the first {reorderItems.length} — {reorderOverflow} more are flagged on other pages.
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
