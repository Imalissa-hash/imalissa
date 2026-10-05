"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
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
  Checkbox,
  BusyBtn,
  Btn,
  ConfirmDialog,
} from "@/components/admin/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { slugify } from "@/lib/utils";

/** Category tree row — server-serialized, includes product counts. */
export interface CategoryTreeNode {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  description: string | null;
  image: string | null;
  icon: string | null;
  isActive: boolean;
  position: number;
  showInMenu: boolean;
  productCount: number;
  children: CategoryTreeNode[];
}

interface FlatRow {
  node: CategoryTreeNode;
  depth: number;
}

interface CatForm {
  name: string;
  slug: string;
  parentId: string;
  position: string;
  isActive: boolean;
  description: string;
  image: string;
  icon: string;
}

type ModalState =
  | { mode: "create"; parent: CategoryTreeNode | null }
  | { mode: "edit"; node: CategoryTreeNode };

function flatten(nodes: CategoryTreeNode[], depth = 0, out: FlatRow[] = []): FlatRow[] {
  for (const n of nodes) {
    out.push({ node: n, depth });
    flatten(n.children, depth + 1, out);
  }
  return out;
}

function blankForm(parent: CategoryTreeNode | null): CatForm {
  return {
    name: "",
    slug: "",
    parentId: parent?.id ?? "",
    position: "0",
    isActive: true,
    description: "",
    image: "",
    icon: "",
  };
}

function formFromNode(node: CategoryTreeNode): CatForm {
  return {
    name: node.name,
    slug: node.slug,
    parentId: node.parentId ?? "",
    position: String(node.position),
    isActive: node.isActive,
    description: node.description ?? "",
    image: node.image ?? "",
    icon: node.icon ?? "",
  };
}

export function CategoriesClient({ items }: { items: CategoryTreeNode[] }) {
  const router = useRouter();
  const flat = flatten(items);

  const [modal, setModal] = useState<ModalState | null>(null);
  const [form, setForm] = useState<CatForm>(() => blankForm(null));
  const [slugTouched, setSlugTouched] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CategoryTreeNode | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const set = <K extends keyof CatForm>(key: K, value: CatForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const openCreate = (parent: CategoryTreeNode | null) => {
    setForm(blankForm(parent));
    setSlugTouched(false);
    setModalError(null);
    setModal({ mode: "create", parent });
  };

  const openEdit = (node: CategoryTreeNode) => {
    setForm(formFromNode(node));
    setSlugTouched(true);
    setModalError(null);
    setModal({ mode: "edit", node });
  };

  const closeModal = () => {
    if (busy) return;
    setModal(null);
    setModalError(null);
  };

  // Parent options: exclude the edited node and its descendants (would create a cycle).
  const excluded = new Set<string>();
  if (modal?.mode === "edit") {
    const collect = (n: CategoryTreeNode) => {
      excluded.add(n.id);
      n.children.forEach(collect);
    };
    collect(modal.node);
  }
  const parentOptions = flat.filter((r) => !excluded.has(r.node.id));

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || uploading) return;
    setUploading(true);
    setModalError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/upload?dir=categories", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({ ok: false }));
      if (json.ok && json.data?.url) set("image", json.data.url as string);
      else setModalError(json.message ?? "Could not upload the image");
    } catch {
      setModalError("Network error — could not upload the image");
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modal || busy) return;

    if (form.name.trim().length < 2) {
      setModalError("Enter a category name (at least 2 characters)");
      return;
    }
    const position = Number(form.position || 0);
    if (Number.isNaN(position) || !Number.isInteger(position) || position < 0) {
      setModalError("Position must be a whole number (0 or more)");
      return;
    }

    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim() || null,
      parentId: form.parentId || null,
      position,
      isActive: form.isActive,
      description: form.description.trim() || null,
      image: form.image || null,
      icon: form.icon.trim() || null,
    };

    setBusy(true);
    setModalError(null);
    try {
      const url =
        modal.mode === "create" ? "/api/admin/categories" : `/api/admin/categories/${modal.node.id}`;
      const res = await fetch(url, {
        method: modal.mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({ ok: false }));
      if (!json.ok) {
        setModalError(json.message ?? "Could not save the category");
        return;
      }
      setModal(null);
      router.refresh();
    } catch {
      setModalError("Network error — please try again");
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/categories/${deleting.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({ ok: false }));
      setDeleting(null);
      if (!json.ok) setError(json.message ?? "Could not delete the category");
      else router.refresh();
    } catch {
      setDeleting(null);
      setError("Network error — please try again");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-[0.84rem] text-danger">
          {error}
        </div>
      )}

      <Panel
        padded={false}
        action={
          <button
            onClick={() => openCreate(null)}
            className="btn-gold flex items-center gap-2 rounded-xl px-4 py-2.5 text-[0.84rem]"
          >
            <Plus size={15} /> New category
          </button>
        }
      >
        {flat.length === 0 ? (
          <div className="p-5">
            <Empty title="No categories yet" hint="Create the first top-level category to start organizing products." />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Category</Th>
                <Th className="text-right">Products</Th>
                <Th>Position</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {flat.map(({ node, depth }) => (
                <tr key={node.id} className="transition hover:bg-white/[0.02]">
                  <Td>
                    <div className="flex items-center gap-3" style={{ paddingLeft: `${depth * 24}px` }}>
                      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
                        {node.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={node.image} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[0.7rem] font-bold text-gold-400">
                            {node.name.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-mist-100">{node.name}</p>
                        <p className="truncate text-[0.74rem] text-mist-600">
                          /{node.slug}
                          {node.icon ? ` · icon: ${node.icon}` : ""}
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td className="text-right font-display font-semibold text-mist-200">
                    {node.productCount}
                  </Td>
                  <Td className="text-mist-500">{node.position}</Td>
                  <Td>
                    <StatusBadge status={node.isActive ? "ACTIVE" : "INACTIVE"} />
                  </Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openCreate(node)}
                        aria-label={`Add child to ${node.name}`}
                        title="Add child category"
                        className="rounded-lg p-2 text-mist-500 transition hover:bg-white/[0.06] hover:text-gold-300"
                      >
                        <Plus size={14} />
                      </button>
                      <button
                        onClick={() => openEdit(node)}
                        aria-label={`Edit ${node.name}`}
                        title="Edit"
                        className="rounded-lg p-2 text-mist-500 transition hover:bg-white/[0.06] hover:text-gold-300"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setDeleting(node)}
                        aria-label={`Delete ${node.name}`}
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

      {/* Create / edit modal */}
      <Modal
        open={modal !== null}
        onClose={closeModal}
        title={modal?.mode === "edit" ? "Edit category" : modal?.parent ? `New category in “${modal.parent.name}”` : "New category"}
        wide
      >
        <form onSubmit={submit} className="space-y-4">
          {modalError && (
            <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-[0.84rem] text-danger">
              {modalError}
            </div>
          )}

          <Field label="Name">
            <TextInput
              value={form.name}
              onChange={(e) => {
                const name = e.target.value;
                setForm((prev) => ({
                  ...prev,
                  name,
                  ...(slugTouched ? {} : { slug: slugify(name) }),
                }));
              }}
              placeholder="e.g. Women"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Slug" hint="URL — auto-filled until you edit it.">
              <TextInput
                value={form.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  set("slug", e.target.value);
                }}
                placeholder="women"
              />
            </Field>
            <Field label="Parent category">
              <Select
                value={form.parentId}
                onChange={(e) => set("parentId", e.target.value)}
                disabled={modal?.mode === "create" && modal.parent !== null}
              >
                <option value="">Top-level</option>
                {parentOptions.map(({ node, depth }) => (
                  <option key={node.id} value={node.id}>
                    {`${"— ".repeat(depth)}${node.name}`}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Position" hint="Lower numbers appear first among siblings.">
              <TextInput
                type="number"
                min={0}
                step={1}
                value={form.position}
                onChange={(e) => set("position", e.target.value)}
              />
            </Field>
            <Field label="Icon" hint="Icon name shown on storefront menus (text).">
              <TextInput
                value={form.icon}
                onChange={(e) => set("icon", e.target.value)}
                placeholder="sparkles"
              />
            </Field>
          </div>

          <Field label="Description">
            <TextArea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              maxLength={2000}
              className="min-h-20"
            />
          </Field>

          <div>
            <label className="mb-1.5 block text-[0.78rem] font-semibold text-mist-300">Image</label>
            <div className="flex items-center gap-3">
              {form.image && (
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.image} alt="" className="h-full w-full object-cover" />
                </div>
              )}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/12 px-3.5 py-2 text-[0.8rem] font-semibold text-mist-300 transition hover:border-gold-500/40 hover:text-gold-300">
                {uploading ? <Loader2 size={13} className="animate-spin" /> : null}
                {uploading ? "Uploading…" : form.image ? "Replace image" : "Upload image"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                  className="hidden"
                  onChange={onPickImage}
                  disabled={uploading}
                />
              </label>
              {form.image && (
                <button
                  type="button"
                  onClick={() => set("image", "")}
                  className="rounded-lg p-2 text-mist-500 transition hover:bg-danger/10 hover:text-danger"
                  aria-label="Remove image"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <Checkbox label="Active (visible in the storefront)" checked={form.isActive} onChange={(v) => set("isActive", v)} />

          <div className="flex justify-end gap-3 border-t border-white/[0.07] pt-4">
            <Btn variant="outline" onClick={closeModal}>
              Cancel
            </Btn>
            <BusyBtn busy={busy} type="submit">
              {modal?.mode === "edit" ? "Save changes" : "Create category"}
            </BusyBtn>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete category"
        message={`Delete “${deleting?.name ?? ""}”? Categories with subcategories or assigned products cannot be deleted — reassign or remove them first.`}
        confirmLabel="Delete"
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
