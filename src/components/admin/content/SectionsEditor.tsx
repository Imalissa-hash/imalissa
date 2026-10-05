"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Trash2,
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
  TextArea,
  Select,
  Btn,
  BusyBtn,
  ConfirmDialog,
} from "@/components/admin/ui";
import { cn, formatDate } from "@/lib/utils";

/** One homepage section row — server-serialized (matches getHomeSections()). */
export interface SectionRow {
  id: string;
  key: string;
  title: string;
  subtitle: string | null;
  type: string; // PRODUCT_GRID | CATEGORY_GRID | BANNER_GRID | TEXT_ONLY
  source: string;
  itemIds: string[] | null;
  image: string | null;
  link: string | null;
  buttonText: string | null;
  order: number;
  isVisible: boolean;
  updatedAt: string;
}

type SectionForm = {
  key: string;
  title: string;
  subtitle: string;
  type: "PRODUCT_GRID" | "CATEGORY_GRID" | "BANNER_GRID" | "TEXT_ONLY";
  source: string;
  link: string;
  buttonText: string;
  itemIds: string;
};

const emptyForm = (): SectionForm => ({
  key: "",
  title: "",
  subtitle: "",
  type: "PRODUCT_GRID",
  source: "featured",
  link: "",
  buttonText: "",
  itemIds: "",
});

const TYPE_STYLE: Record<string, string> = {
  PRODUCT_GRID: "border-gold-500/30 bg-gold-500/[0.08] text-gold-300",
  CATEGORY_GRID: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  BANNER_GRID: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  TEXT_ONLY: "border-white/15 bg-white/[0.05] text-mist-300",
};

const parseItemIds = (raw: string): string[] | null => {
  const ids = raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length ? ids : null;
};

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

export function SectionsEditor({ sections }: { sections: SectionRow[] }) {
  const router = useRouter();

  const [rows, setRows] = useState<SectionRow[]>(sections);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SectionRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SectionRow | null>(null);
  const [form, setForm] = useState<SectionForm>(emptyForm);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalBusy, setModalBusy] = useState(false);

  // Server truth wins — re-sync whenever the refreshed props arrive.
  useEffect(() => {
    setRows(sections);
  }, [sections]);

  /* ── Mutations ──────────────────────────────────────────────────── */

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= rows.length || moveBusy) return;
    const next = [...rows];
    const tmp = next[index];
    const other = next[target];
    if (!tmp || !other) return;
    next[index] = other;
    next[target] = tmp;

    setMoveBusy(true);
    setError(null);
    setNotice(null);
    const res = await api("/api/admin/homepage/sections/reorder", {
      method: "POST",
      body: JSON.stringify({ orderedIds: next.map((r) => r.id) }),
    });
    setMoveBusy(false);
    if (res.ok) {
      setRows(next);
      setNotice("Section order saved");
      router.refresh();
    } else {
      setError(res.message ?? "Could not reorder the sections");
    }
  };

  const toggleVisible = async (row: SectionRow) => {
    setRowBusy(row.id);
    setError(null);
    setNotice(null);
    const res = await api(`/api/admin/homepage/sections/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isVisible: !row.isVisible }),
    });
    setRowBusy(null);
    if (res.ok) {
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, isVisible: !row.isVisible } : r)));
      setNotice(`“${row.title}” is now ${row.isVisible ? "hidden" : "visible"}`);
      router.refresh();
    } else {
      setError(res.message ?? "Could not change the visibility");
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setError(null);
    const res = await api(`/api/admin/homepage/sections/${deleting.id}`, { method: "DELETE" });
    setDeleting(null);
    setDeleteBusy(false);
    if (res.ok) {
      setRows((rs) => rs.filter((r) => r.id !== deleting.id));
      setNotice("Section deleted");
      router.refresh();
    } else {
      setError(res.message ?? "Could not delete the section");
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setModalError(null);
    setModalOpen(true);
  };

  const openEdit = (row: SectionRow) => {
    setEditing(row);
    setForm({
      key: row.key,
      title: row.title,
      subtitle: row.subtitle ?? "",
      type: (row.type as SectionForm["type"]) || "PRODUCT_GRID",
      source: row.source,
      link: row.link ?? "",
      buttonText: row.buttonText ?? "",
      itemIds: (row.itemIds ?? []).join(", "),
    });
    setModalError(null);
    setModalOpen(true);
  };

  const submit = async () => {
    setModalError(null);
    if (!editing && !form.key.trim()) return setModalError("Key is required");
    if (!form.title.trim()) return setModalError("Title is required");
    if (!form.source.trim()) return setModalError("Source is required");
    const itemIds = parseItemIds(form.itemIds);
    if (itemIds && new Set(itemIds).size !== itemIds.length) {
      return setModalError("Remove duplicate product ids");
    }

    const body = {
      ...(editing
        ? {}
        : { key: form.key.trim().toLowerCase() }),
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      type: form.type,
      source: form.source.trim(),
      link: form.link.trim() || null,
      buttonText: form.buttonText.trim() || null,
      itemIds,
    };

    setModalBusy(true);
    const res = await api(
      editing
        ? `/api/admin/homepage/sections/${editing.id}`
        : "/api/admin/homepage/sections",
      { method: editing ? "PATCH" : "POST", body: JSON.stringify(body) }
    );
    setModalBusy(false);

    if (res.ok) {
      setModalOpen(false);
      if (editing) {
        setRows((rs) =>
          rs.map((r) =>
            r.id === editing.id
              ? {
                  ...r,
                  title: body.title,
                  subtitle: body.subtitle,
                  type: body.type,
                  source: body.source,
                  link: body.link,
                  buttonText: body.buttonText,
                  itemIds: body.itemIds,
                }
              : r
          )
        );
        setNotice(`“${body.title}” updated`);
      } else {
        setNotice(`Section “${body.title}” created`);
      }
      setEditing(null);
      router.refresh();
    } else {
      setModalError(res.message ?? "Could not save the section");
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

      <Panel
        title="Homepage sections"
        subtitle="Rendered top-to-bottom on the storefront home — only visible sections are shown"
        action={
          <Btn onClick={openCreate}>
            <Plus size={14} /> Add section
          </Btn>
        }
      >
        {rows.length === 0 ? (
          <Empty title="No sections yet" hint="Add the first section to start building the home page." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="w-10">#</Th>
                <Th>Section</Th>
                <Th>Type</Th>
                <Th>Source</Th>
                <Th>Visible</Th>
                <Th>Updated</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className="transition hover:bg-white/[0.02]">
                  <Td className="text-mist-600">{i + 1}</Td>
                  <Td className="max-w-[32ch]">
                    <p className="truncate font-semibold text-mist-100" title={r.title}>
                      {r.title}
                    </p>
                    <p className="truncate text-[0.74rem] text-mist-600">
                      <span className="font-mono">{r.key}</span>
                      {r.subtitle ? ` · ${r.subtitle}` : ""}
                    </p>
                  </Td>
                  <Td>
                    <span
                      className={cn(
                        "inline-block whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-wide",
                        TYPE_STYLE[r.type] ?? TYPE_STYLE.TEXT_ONLY
                      )}
                    >
                      {r.type.replace("_", " ")}
                    </span>
                  </Td>
                  <Td className="max-w-[16ch]">
                    <span className="block truncate font-mono text-[0.78rem] text-mist-400" title={r.source}>
                      {r.source}
                    </span>
                    {r.itemIds && r.itemIds.length > 0 && (
                      <span className="text-[0.7rem] text-mist-600">{r.itemIds.length} pinned</span>
                    )}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleVisible(r)}
                        disabled={rowBusy === r.id}
                        title={r.isVisible ? "Click to hide" : "Click to show"}
                        aria-label={r.isVisible ? `Hide ${r.title}` : `Show ${r.title}`}
                        className={cn(
                          "relative h-6 w-11 shrink-0 rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50",
                          r.isVisible ? "border-gold-500/50 bg-gold-500/25" : "border-white/15 bg-white/[0.06]"
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-all",
                            r.isVisible ? "left-[22px] bg-gold-300" : "left-[3px] bg-mist-500"
                          )}
                        />
                      </button>
                      <span className="text-[0.74rem] text-mist-500">
                        {rowBusy === r.id ? "…" : r.isVisible ? "Visible" : "Hidden"}
                      </span>
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap text-mist-500">{formatDate(r.updatedAt, "short")}</Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => move(i, -1)}
                        disabled={moveBusy || i === 0}
                        aria-label={`Move ${r.title} up`}
                        title="Move up"
                        className="rounded-lg p-2 text-mist-500 transition hover:bg-white/[0.06] hover:text-gold-300 disabled:opacity-40"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        onClick={() => move(i, 1)}
                        disabled={moveBusy || i === rows.length - 1}
                        aria-label={`Move ${r.title} down`}
                        title="Move down"
                        className="rounded-lg p-2 text-mist-500 transition hover:bg-white/[0.06] hover:text-gold-300 disabled:opacity-40"
                      >
                        <ChevronDown size={14} />
                      </button>
                      <button
                        onClick={() => openEdit(r)}
                        aria-label={`Edit ${r.title}`}
                        title="Edit"
                        className="rounded-lg p-2 text-mist-500 transition hover:bg-white/[0.06] hover:text-gold-300"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setDeleting(r)}
                        aria-label={`Delete ${r.title}`}
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

      {/* ── Create / edit modal ─────────────────────────────────────── */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${editing.title}` : "New section"}
        wide
      >
        <div className="space-y-4">
          {modalError && (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[0.8rem] text-danger">
              {modalError}
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Key"
              hint={editing ? "The key can't be changed" : "Unique id, e.g. summer_sale"}
            >
              <TextInput
                value={form.key}
                onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
                placeholder="summer_sale"
                disabled={Boolean(editing)}
                spellCheck={false}
              />
            </Field>
            <Field label="Type">
              <Select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as SectionForm["type"] }))}
              >
                <option value="PRODUCT_GRID">Product grid</option>
                <option value="CATEGORY_GRID">Category grid</option>
                <option value="BANNER_GRID">Banner grid</option>
                <option value="TEXT_ONLY">Text only</option>
              </Select>
            </Field>
            <Field label="Title">
              <TextInput
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Trending Now"
              />
            </Field>
            <Field label="Source" hint="featured, bestsellers, new_arrivals, deals, trending or a category slug">
              <TextInput
                value={form.source}
                onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                placeholder="featured"
                spellCheck={false}
              />
            </Field>
            <Field label="Subtitle" className="sm:col-span-2">
              <TextInput
                value={form.subtitle}
                onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
                placeholder="What everyone is buying this week"
              />
            </Field>
            <Field label="Link" hint="Optional — e.g. /search or /c/men">
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
                placeholder="View all"
              />
            </Field>
          </div>

          <Field
            label="Pinned product ids"
            hint="Optional — comma or newline separated. Leave empty to use the source automatically."
          >
            <TextArea
              value={form.itemIds}
              onChange={(e) => setForm((f) => ({ ...f, itemIds: e.target.value }))}
              placeholder="clx1…, clx2…"
              className="min-h-20"
              spellCheck={false}
            />
          </Field>

          <div className="flex justify-end gap-3 pt-1">
            <Btn variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Btn>
            <BusyBtn busy={modalBusy} onClick={submit}>
              {editing ? "Save changes" : "Create section"}
            </BusyBtn>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete section"
        message={`Delete “${deleting?.title ?? ""}” permanently? It disappears from the home page — you can recreate it later.`}
        confirmLabel="Delete"
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
