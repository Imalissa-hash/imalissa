"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  Panel,
  Table,
  Th,
  Td,
  Empty,
  Modal,
  Field,
  TextInput,
  Select,
  Btn,
  BusyBtn,
  ConfirmDialog,
  Checkbox,
} from "@/components/admin/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";

/** One banner row — server-serialized (matches getBanners()). */
export interface BannerRow {
  id: string;
  title: string;
  subtitle: string | null;
  image: string;
  mobileImage: string | null;
  link: string | null;
  buttonText: string | null;
  position: string; // HERO | PROMO | STRIP | FOOTER
  isActive: boolean;
  positionIndex: number;
  createdAt: string;
  updatedAt: string;
}

type BannerForm = {
  title: string;
  subtitle: string;
  image: string;
  mobileImage: string;
  link: string;
  buttonText: string;
  position: "HERO" | "PROMO" | "STRIP" | "FOOTER";
  isActive: boolean;
};

const POSITIONS: { value: BannerForm["position"]; label: string; hint: string }[] = [
  { value: "HERO", label: "Hero", hint: "Main carousel at the top of the home page" },
  { value: "PROMO", label: "Promo", hint: "Promo tiles below the hero" },
  { value: "STRIP", label: "Strip", hint: "Narrow promotional strip" },
  { value: "FOOTER", label: "Footer", hint: "Banner shown above the footer" },
];

const emptyForm = (position: BannerForm["position"]): BannerForm => ({
  title: "",
  subtitle: "",
  image: "",
  mobileImage: "",
  link: "",
  buttonText: "",
  position,
  isActive: true,
});

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

export function BannersManager({ banners }: { banners: BannerRow[] }) {
  const router = useRouter();

  const [rows, setRows] = useState<BannerRow[]>(banners);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<BannerRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BannerRow | null>(null);
  const [form, setForm] = useState<BannerForm>(() => emptyForm("HERO"));
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalBusy, setModalBusy] = useState(false);
  const [uploading, setUploading] = useState<"image" | "mobileImage" | null>(null);

  // Server truth wins — re-sync whenever the refreshed props arrive.
  useEffect(() => {
    setRows(banners);
  }, [banners]);

  /* ── Mutations ──────────────────────────────────────────────────── */

  const toggleActive = async (row: BannerRow) => {
    setRowBusy(row.id);
    setError(null);
    setNotice(null);
    const res = await api(`/api/admin/homepage/banners/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !row.isActive }),
    });
    setRowBusy(null);
    if (res.ok) {
      setRows((rs) => rs.map((b) => (b.id === row.id ? { ...b, isActive: !row.isActive } : b)));
      setNotice(`“${row.title}” ${row.isActive ? "deactivated" : "activated"}`);
      router.refresh();
    } else {
      setError(res.message ?? "Could not change the banner status");
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setError(null);
    const res = await api(`/api/admin/homepage/banners/${deleting.id}`, { method: "DELETE" });
    setDeleting(null);
    setDeleteBusy(false);
    if (res.ok) {
      setRows((rs) => rs.filter((b) => b.id !== deleting.id));
      setNotice("Banner deleted");
      router.refresh();
    } else {
      setError(res.message ?? "Could not delete the banner");
    }
  };

  const openCreate = (position: BannerForm["position"]) => {
    setEditing(null);
    setForm(emptyForm(position));
    setModalError(null);
    setModalOpen(true);
  };

  const openEdit = (row: BannerRow) => {
    setEditing(row);
    setForm({
      title: row.title,
      subtitle: row.subtitle ?? "",
      image: row.image,
      mobileImage: row.mobileImage ?? "",
      link: row.link ?? "",
      buttonText: row.buttonText ?? "",
      position: (row.position as BannerForm["position"]) || "HERO",
      isActive: row.isActive,
    });
    setModalError(null);
    setModalOpen(true);
  };

  const upload = async (file: File | null | undefined, field: "image" | "mobileImage") => {
    if (!file) return;
    setModalError(null);
    setUploading(field);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/upload?dir=banners", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({ ok: false, message: "Unexpected server response" }));
      if (json.ok && json.data?.url) {
        const url = String(json.data.url);
        setForm((f) => ({ ...f, [field]: url }));
      } else {
        setModalError(json.message ?? "Upload failed");
      }
    } catch {
      setModalError("Network error — upload failed");
    } finally {
      setUploading(null);
    }
  };

  const submit = async () => {
    setModalError(null);
    if (!form.title.trim()) return setModalError("Title is required");
    if (!form.image.trim()) return setModalError("Image is required");

    const body = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      image: form.image.trim(),
      mobileImage: form.mobileImage.trim() || null,
      link: form.link.trim() || null,
      buttonText: form.buttonText.trim() || null,
      position: form.position,
      isActive: form.isActive,
    };

    setModalBusy(true);
    const res = await api(
      editing ? `/api/admin/homepage/banners/${editing.id}` : "/api/admin/homepage/banners",
      { method: editing ? "PATCH" : "POST", body: JSON.stringify(body) }
    );
    setModalBusy(false);

    if (res.ok) {
      setModalOpen(false);
      setNotice(editing ? `“${body.title}” updated` : `Banner “${body.title}” created`);
      setEditing(null);
      // Re-syncs rows (incl. position slot) once the refreshed props arrive.
      router.refresh();
    } else {
      setModalError(res.message ?? "Could not save the banner");
    }
  };

  /* ── Render ─────────────────────────────────────────────────────── */

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

      <div className="space-y-6">
        {POSITIONS.map((p) => {
          const group = rows
            .filter((b) => b.position === p.value)
            .sort((a, b) => a.positionIndex - b.positionIndex);
          return (
            <Panel
              key={p.value}
              title={`${p.label} banners`}
              subtitle={p.hint}
              action={
                <Btn variant="outline" onClick={() => openCreate(p.value)}>
                  <Plus size={14} /> Add {p.label.toLowerCase()}
                </Btn>
              }
            >
              {group.length === 0 ? (
                <Empty
                  title={`No ${p.label.toLowerCase()} banners`}
                  hint="Add one to show content in this slot."
                />
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Banner</Th>
                      <Th>Link</Th>
                      <Th>Status</Th>
                      <Th className="text-right">Actions</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.map((b) => (
                      <tr key={b.id} className="transition hover:bg-white/[0.02]">
                        <Td>
                          <div className="flex items-center gap-3">
                            <div className="h-12 w-24 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={b.image} alt="" className="h-full w-full object-cover" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-mist-100">{b.title}</p>
                              <p className="truncate text-[0.74rem] text-mist-600">
                                {b.subtitle ?? "—"}
                                {b.buttonText ? ` · CTA: “${b.buttonText}”` : ""}
                              </p>
                            </div>
                          </div>
                        </Td>
                        <Td className="max-w-[22ch]">
                          {b.link ? (
                            <span className="block truncate font-mono text-[0.78rem] text-mist-400" title={b.link}>
                              {b.link}
                            </span>
                          ) : (
                            <span className="text-mist-600">—</span>
                          )}
                        </Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toggleActive(b)}
                              disabled={rowBusy === b.id}
                              title={b.isActive ? "Click to deactivate" : "Click to activate"}
                              aria-label={b.isActive ? `Deactivate ${b.title}` : `Activate ${b.title}`}
                              className={cn(
                                "relative h-6 w-11 shrink-0 rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50",
                                b.isActive ? "border-gold-500/50 bg-gold-500/25" : "border-white/15 bg-white/[0.06]"
                              )}
                            >
                              <span
                                className={cn(
                                  "absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-all",
                                  b.isActive ? "left-[22px] bg-gold-300" : "left-[3px] bg-mist-500"
                                )}
                              />
                            </button>
                            <StatusBadge status={b.isActive ? "ACTIVE" : "INACTIVE"} />
                          </div>
                        </Td>
                        <Td>
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEdit(b)}
                              aria-label={`Edit ${b.title}`}
                              title="Edit"
                              className="rounded-lg p-2 text-mist-500 transition hover:bg-white/[0.06] hover:text-gold-300"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => setDeleting(b)}
                              aria-label={`Delete ${b.title}`}
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
          );
        })}
      </div>

      {/* ── Create / edit modal ─────────────────────────────────────── */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${editing.title}` : "New banner"}
        wide
      >
        <div className="space-y-4">
          {modalError && (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[0.8rem] text-danger">
              {modalError}
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Title">
              <TextInput
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="The Premium Sale"
              />
            </Field>
            <Field label="Position">
              <Select
                value={form.position}
                onChange={(e) =>
                  setForm((f) => ({ ...f, position: e.target.value as BannerForm["position"] }))
                }
              >
                {POSITIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Subtitle" className="sm:col-span-2">
              <TextInput
                value={form.subtitle}
                onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
                placeholder="Up to 40% off on electronics, fashion & lifestyle"
              />
            </Field>
            <Field label="Link" hint="e.g. /search?sort=discount">
              <TextInput
                value={form.link}
                onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
                placeholder="/search"
              />
            </Field>
            <Field label="Button text" hint="Optional CTA label">
              <TextInput
                value={form.buttonText}
                onChange={(e) => setForm((f) => ({ ...f, buttonText: e.target.value }))}
                placeholder="Shop Now"
              />
            </Field>
          </div>

          <Field
            label="Image"
            hint="Upload a file or paste an /uploads/… or https://… URL"
          >
            <div className="flex gap-2">
              <TextInput
                value={form.image}
                onChange={(e) => setForm((f) => ({ ...f, image: e.target.value }))}
                placeholder="/uploads/banners/hero-1.svg"
                spellCheck={false}
              />
              <label
                className={cn(
                  "inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-white/12 px-3 py-2.5 text-[0.84rem] font-semibold text-mist-300 transition hover:border-gold-500/40 hover:text-gold-300",
                  uploading !== null && "pointer-events-none opacity-50"
                )}
                title="Upload image"
              >
                {uploading === "image" ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Upload size={14} />
                )}
                Upload
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => upload(e.target.files?.[0], "image")}
                />
              </label>
            </div>
            {form.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.image}
                alt="Banner preview"
                className="mt-2 h-20 rounded-lg border border-white/10 object-cover"
              />
            )}
          </Field>

          <Field
            label="Mobile image (optional)"
            hint="Shown on small screens — falls back to the main image"
          >
            <div className="flex gap-2">
              <TextInput
                value={form.mobileImage}
                onChange={(e) => setForm((f) => ({ ...f, mobileImage: e.target.value }))}
                placeholder="/uploads/banners/hero-1-mobile.svg"
                spellCheck={false}
              />
              <label
                className={cn(
                  "inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-white/12 px-3 py-2.5 text-[0.84rem] font-semibold text-mist-300 transition hover:border-gold-500/40 hover:text-gold-300",
                  uploading !== null && "pointer-events-none opacity-50"
                )}
                title="Upload mobile image"
              >
                {uploading === "mobileImage" ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Upload size={14} />
                )}
                Upload
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => upload(e.target.files?.[0], "mobileImage")}
                />
              </label>
            </div>
          </Field>

          <Checkbox
            label="Active (shown on the storefront)"
            checked={form.isActive}
            onChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
          />

          <div className="flex justify-end gap-3 pt-1">
            <Btn variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Btn>
            <BusyBtn busy={modalBusy} onClick={submit}>
              {editing ? "Save changes" : "Create banner"}
            </BusyBtn>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete banner"
        message={`Delete “${deleting?.title ?? ""}” permanently? It will disappear from the storefront immediately.`}
        confirmLabel="Delete"
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
