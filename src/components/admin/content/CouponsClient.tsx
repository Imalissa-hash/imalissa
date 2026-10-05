"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  Panel,
  Table,
  Th,
  Td,
  Empty,
  SearchInput,
  Select,
  Modal,
  Field,
  TextInput,
  TextArea,
  Btn,
  BusyBtn,
  ConfirmDialog,
  Checkbox,
} from "@/components/admin/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Pagination } from "@/components/ui/Pagination";
import { formatBDT, formatDate } from "@/lib/utils";

/** One coupon row — server-serialized (Decimals already converted to numbers). */
export interface CouponRow {
  id: string;
  code: string;
  type: string; // PERCENTAGE | FIXED
  value: number;
  minOrder: number;
  maxDiscount: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  usageLimit: number | null;
  usedCount: number;
  perUserLimit: number;
  isActive: boolean;
  description: string | null;
  createdAt: string;
}

type CouponForm = {
  code: string;
  type: "PERCENTAGE" | "FIXED";
  value: string;
  minOrder: string;
  maxDiscount: string;
  startsAt: string;
  endsAt: string;
  usageLimit: string;
  perUserLimit: string;
  description: string;
  isActive: boolean;
};

const emptyForm = (): CouponForm => ({
  code: "",
  type: "PERCENTAGE",
  value: "",
  minOrder: "",
  maxDiscount: "",
  startsAt: "",
  endsAt: "",
  usageLimit: "",
  perUserLimit: "1",
  description: "",
  isActive: true,
});

/** ISO string → value for <input type="datetime-local"> (local time). */
const toLocalInput = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Lifecycle badge: INACTIVE / SCHEDULED / EXPIRED / EXHAUSTED / ACTIVE. */
const couponState = (c: CouponRow): string => {
  if (!c.isActive) return "INACTIVE";
  const now = Date.now();
  if (c.startsAt && new Date(c.startsAt).getTime() > now) return "SCHEDULED";
  if (c.expiresAt && new Date(c.expiresAt).getTime() < now) return "EXPIRED";
  if (c.usageLimit !== null && c.usedCount >= c.usageLimit) return "EXHAUSTED";
  return "ACTIVE";
};

const valueLabel = (c: CouponRow) =>
  c.type === "PERCENTAGE" ? `${c.value}% off` : `${formatBDT(c.value)} off`;

async function api(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    const json = await res.json().catch(() => ({ ok: false, message: "Unexpected server response" }));
    return { ok: Boolean(json.ok), message: json.message as string | undefined };
  } catch {
    return { ok: false, message: "Network error — please try again" };
  }
}

export function CouponsClient({
  items,
  totalPages,
  page,
  searchParams,
}: {
  items: CouponRow[];
  total: number;
  totalPages: number;
  page: number;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const router = useRouter();
  const get = (k: string) => {
    const v = searchParams[k];
    return typeof v === "string" ? v : "";
  };

  const active = get("active");
  const urlQ = get("q");

  const [q, setQ] = useState(urlQ);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CouponRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CouponRow | null>(null);
  const [form, setForm] = useState<CouponForm>(emptyForm);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalBusy, setModalBusy] = useState(false);

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
    router.push(`/admin/coupons${qs ? `?${qs}` : ""}`);
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

  /* ── Mutations ──────────────────────────────────────────────────── */

  const toggleActive = async (c: CouponRow) => {
    setBusyId(c.id);
    setError(null);
    setNotice(null);
    const res = await api(`/api/admin/coupons/${c.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !c.isActive }),
    });
    setBusyId(null);
    if (res.ok) {
      setNotice(`“${c.code}” ${c.isActive ? "deactivated" : "activated"}`);
      router.refresh();
    } else {
      setError(res.message ?? "Could not change the coupon status");
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setError(null);
    setNotice(null);
    const res = await api(`/api/admin/coupons/${deleting.id}`, { method: "DELETE" });
    setDeleting(null);
    setDeleteBusy(false);
    if (res.ok) {
      setNotice("Coupon deleted");
      router.refresh();
    } else {
      setError(res.message ?? "Could not delete the coupon");
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setModalError(null);
    setModalOpen(true);
  };

  const openEdit = (c: CouponRow) => {
    setEditing(c);
    setForm({
      code: c.code,
      type: c.type === "FIXED" ? "FIXED" : "PERCENTAGE",
      value: String(c.value),
      minOrder: c.minOrder ? String(c.minOrder) : "",
      maxDiscount: c.maxDiscount !== null ? String(c.maxDiscount) : "",
      startsAt: toLocalInput(c.startsAt),
      endsAt: toLocalInput(c.expiresAt),
      usageLimit: c.usageLimit !== null ? String(c.usageLimit) : "",
      perUserLimit: String(c.perUserLimit),
      description: c.description ?? "",
      isActive: c.isActive,
    });
    setModalError(null);
    setModalOpen(true);
  };

  const submit = async () => {
    setModalError(null);
    if (!form.code.trim()) return setModalError("Code is required");
    if (!form.value.trim()) return setModalError("Value is required");

    const numeric: [keyof CouponForm, string][] = [
      ["value", "Value"],
      ["minOrder", "Minimum order"],
      ["maxDiscount", "Max discount"],
      ["usageLimit", "Usage limit"],
      ["perUserLimit", "Per-customer limit"],
    ];
    for (const [k, label] of numeric) {
      const v = String(form[k]).trim();
      if (v !== "" && Number.isNaN(Number(v))) return setModalError(`${label} must be a number`);
    }
    if (Number(form.value) <= 0) return setModalError("Value must be greater than 0");
    if (form.type === "PERCENTAGE" && Number(form.value) > 100) {
      return setModalError("Percentage discounts cannot exceed 100");
    }

    const body = {
      code: form.code.trim(),
      type: form.type,
      value: Number(form.value),
      minOrder: form.minOrder.trim() ? Number(form.minOrder) : null,
      maxDiscount:
        form.type === "PERCENTAGE" && form.maxDiscount.trim() ? Number(form.maxDiscount) : null,
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      usageLimit: form.usageLimit.trim() ? Number(form.usageLimit) : null,
      perUserLimit: form.perUserLimit.trim() ? Number(form.perUserLimit) : undefined,
      description: form.description.trim(),
      isActive: form.isActive,
    };

    setModalBusy(true);
    const res = await api(editing ? `/api/admin/coupons/${editing.id}` : "/api/admin/coupons", {
      method: editing ? "PATCH" : "POST",
      body: JSON.stringify(body),
    });
    setModalBusy(false);

    if (res.ok) {
      setModalOpen(false);
      setEditing(null);
      setNotice(editing ? `“${form.code.trim().toUpperCase()}” updated` : "Coupon created");
      router.refresh();
    } else {
      setModalError(res.message ?? "Could not save the coupon");
    }
  };

  /* ── Render ─────────────────────────────────────────────────────── */

  const hasFilters = Boolean(urlQ || active);

  return (
    <div>
      {error && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-[0.84rem] text-danger">
          <span className="flex gap-2">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            {error}
          </span>
          <button onClick={() => setError(null)} aria-label="Dismiss" className="shrink-0 text-danger/80 hover:text-danger">
            <X size={14} />
          </button>
        </div>
      )}

      {notice && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-[0.84rem] text-success">
          <span className="flex gap-2">
            <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
            {notice}
          </span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="shrink-0 text-success/80 hover:text-success">
            <X size={14} />
          </button>
        </div>
      )}

      <Panel
        title="Coupons"
        subtitle="Codes customers can apply at checkout — pricing is always computed server-side"
        action={
          <Btn onClick={openCreate}>
            <Plus size={14} /> New coupon
          </Btn>
        }
      >
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder="Search code or description…"
            className="w-full sm:w-72"
          />
          <Select value={active} onChange={(e) => push({ active: e.target.value })} className="sm:w-44">
            <option value="">All coupons</option>
            <option value="1">Active only</option>
            <option value="0">Inactive only</option>
          </Select>
        </div>

        {items.length === 0 ? (
          <Empty
            title={hasFilters ? "No coupons match your filters" : "No coupons yet"}
            hint={
              hasFilters
                ? "Try a different search term, or clear the filters above."
                : "Create your first discount code with “New coupon”."
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Discount</Th>
                <Th>Status</Th>
                <Th>Usage</Th>
                <Th>Validity</Th>
                <Th>Description</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="transition hover:bg-white/[0.02]">
                  <Td>
                    <span className="font-mono text-[0.88rem] font-bold tracking-wide text-gold-300">
                      {c.code}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap">
                    <span className="font-semibold text-mist-100">{valueLabel(c)}</span>
                    <p className="text-[0.72rem] text-mist-600">
                      Min order {formatBDT(c.minOrder)}
                      {c.type === "PERCENTAGE" && c.maxDiscount !== null
                        ? ` · max ${formatBDT(c.maxDiscount)}`
                        : ""}
                    </p>
                  </Td>
                  <Td>
                    <StatusBadge status={couponState(c)} />
                  </Td>
                  <Td className="whitespace-nowrap">
                    <span className="font-semibold text-mist-200">
                      {c.usedCount}
                      {c.usageLimit !== null && ` / ${c.usageLimit}`}
                    </span>
                    <p className="text-[0.72rem] text-mist-600">
                      {c.perUserLimit > 0 ? `${c.perUserLimit} per customer` : "Unlimited per customer"}
                    </p>
                  </Td>
                  <Td className="whitespace-nowrap text-[0.8rem]">
                    {c.startsAt ? formatDate(c.startsAt, "short") : "Immediately"}
                    <span className="mx-1 text-mist-600">→</span>
                    {c.expiresAt ? formatDate(c.expiresAt, "short") : "No expiry"}
                  </Td>
                  <Td className="max-w-[24ch]">
                    {c.description ? (
                      <span className="line-clamp-2 text-[0.8rem] text-mist-400" title={c.description}>
                        {c.description}
                      </span>
                    ) : (
                      <span className="text-mist-600">—</span>
                    )}
                  </Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(c)}
                        aria-label={`Edit ${c.code}`}
                        title="Edit"
                        className="rounded-lg p-2 text-mist-500 transition hover:bg-white/[0.06] hover:text-gold-300"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => toggleActive(c)}
                        disabled={busyId === c.id}
                        className="rounded-lg px-2 py-1.5 text-[0.74rem] text-mist-500 transition hover:bg-white/[0.06] hover:text-gold-300 disabled:opacity-50"
                      >
                        {busyId === c.id ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : c.isActive ? (
                          "Deactivate"
                        ) : (
                          "Activate"
                        )}
                      </button>
                      <button
                        onClick={() => setDeleting(c)}
                        aria-label={`Delete ${c.code}`}
                        title="Delete"
                        className="rounded-lg p-2 text-mist-500 transition hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      <Pagination
        page={page}
        totalPages={totalPages}
        basePath="/admin/coupons"
        searchParams={searchParams}
      />

      {/* ── Create / edit modal ─────────────────────────────────────── */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${editing.code}` : "New coupon"}
        wide
      >
        <div className="space-y-4">
          {modalError && (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[0.8rem] text-danger">
              {modalError}
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Code" hint="Letters, numbers, dashes — stored uppercase">
              <TextInput
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="WELCOME10"
                autoCapitalize="characters"
                spellCheck={false}
              />
            </Field>
            <Field label="Discount type">
              <Select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as CouponForm["type"] }))}
              >
                <option value="PERCENTAGE">Percentage (%)</option>
                <option value="FIXED">Fixed amount (৳)</option>
              </Select>
            </Field>
            <Field
              label="Value"
              hint={form.type === "PERCENTAGE" ? "1 to 100" : "Discount amount in taka"}
            >
              <TextInput
                value={form.value}
                onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                placeholder={form.type === "PERCENTAGE" ? "10" : "80"}
                inputMode="decimal"
              />
            </Field>
            <Field
              label="Minimum order"
              hint={
                form.type === "FIXED"
                  ? "Must be at least the discount value"
                  : "Blank = no minimum"
              }
            >
              <TextInput
                value={form.minOrder}
                onChange={(e) => setForm((f) => ({ ...f, minOrder: e.target.value }))}
                placeholder="0"
                inputMode="decimal"
              />
            </Field>
            <Field label="Max discount" hint="Percentage only — blank = unlimited">
              <TextInput
                value={form.maxDiscount}
                onChange={(e) => setForm((f) => ({ ...f, maxDiscount: e.target.value }))}
                placeholder="500"
                inputMode="decimal"
                disabled={form.type !== "PERCENTAGE"}
              />
            </Field>
            <Field label="Usage limit" hint="Total uses — blank = unlimited">
              <TextInput
                value={form.usageLimit}
                onChange={(e) => setForm((f) => ({ ...f, usageLimit: e.target.value }))}
                placeholder="1000"
                inputMode="numeric"
              />
            </Field>
            <Field label="Starts at" hint="Blank = active immediately">
              <TextInput
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
              />
            </Field>
            <Field label="Ends at" hint="Blank = no expiry">
              <TextInput
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
              />
            </Field>
            <Field label="Per-customer limit" hint="0 = unlimited, default 1">
              <TextInput
                value={form.perUserLimit}
                onChange={(e) => setForm((f) => ({ ...f, perUserLimit: e.target.value }))}
                placeholder="1"
                inputMode="numeric"
              />
            </Field>
            <div className="flex items-end pb-1">
              <Checkbox
                label="Active (customers can use this code)"
                checked={form.isActive}
                onChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
              />
            </div>
          </div>

          <Field label="Description" hint="Shown in admin and returned to checkout — optional">
            <TextArea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="10% off your first order (max ৳500)"
              className="min-h-20"
            />
          </Field>

          <div className="flex justify-end gap-3 pt-1">
            <Btn variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Btn>
            <BusyBtn busy={modalBusy} onClick={submit}>
              {editing ? "Save changes" : "Create coupon"}
            </BusyBtn>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete coupon"
        message={
          deleting
            ? `Delete “${deleting.code}” permanently? Coupons that have already been used cannot be deleted — deactivate them instead.`
            : ""
        }
        confirmLabel="Delete"
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
