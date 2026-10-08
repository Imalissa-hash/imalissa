"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Pencil, Plus, ShieldAlert, Trash2, UserPlus, X } from "lucide-react";
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
} from "@/components/admin/ui";
import { cn, formatDate, getInitials, timeAgo } from "@/lib/utils";

/**
 * Admin accounts manager. Viewing is allowed for every signed-in admin;
 * mutations are SUPER_ADMIN-only server-side (requireRole() with no role
 * args) and any 403/guard rejection is surfaced honestly as a banner.
 */

interface AdminRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface Me {
  id: string;
  role: string;
}

type Role = "SUPER_ADMIN" | "MANAGER" | "SUPPORT" | "CONTENT";

const ROLES: { value: Role; label: string; desc: string }[] = [
  { value: "SUPER_ADMIN", label: "Super Admin", desc: "Full control, including managing admin accounts" },
  { value: "MANAGER", label: "Manager", desc: "Day-to-day store operations (orders, catalog, coupons)" },
  { value: "SUPPORT", label: "Support", desc: "Customer-facing work (orders, reviews, messages)" },
  { value: "CONTENT", label: "Content", desc: "Catalog and storefront content" },
];

const ROLE_STYLE: Record<Role, string> = {
  SUPER_ADMIN: "border-gold-500/40 bg-gold-500/10 text-gold-300",
  MANAGER: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  SUPPORT: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  CONTENT: "border-violet-500/30 bg-violet-500/10 text-violet-300",
};

const roleLabel = (r: string) => r.replace("_", " ");

async function api<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; data?: T; message?: string }> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    const json = await res.json().catch(() => ({ ok: false, message: "Unexpected server response" }));
    return { ok: Boolean(json.ok), data: json.data as T | undefined, message: json.message as string | undefined };
  } catch {
    return { ok: false, message: "Network error — please try again" };
  }
}

export function AdminsClient() {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [editRow, setEditRow] = useState<AdminRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<AdminRow | null>(null);

  const [addForm, setAddForm] = useState({ name: "", email: "", password: "", role: "SUPPORT" as Role });
  const [editForm, setEditForm] = useState({ name: "", role: "SUPPORT" as Role, password: "" });
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalBusy, setModalBusy] = useState(false);

  const isSuper = me?.role === "SUPER_ADMIN";

  const load = useCallback(async () => {
    const res = await api<{ admins: AdminRow[] }>("/api/admin/admins");
    if (res.ok && res.data) {
      setAdmins(res.data.admins);
      setError(null);
    } else {
      setError(res.message ?? "Could not load admin accounts");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const meRes = await api<Me | null>("/api/admin/auth/me");
      if (meRes.ok) setMe(meRes.data ?? null);
      await load();
    })();
  }, [load]);

  /* ── Mutations ──────────────────────────────────────────────────── */

  const create = async () => {
    setModalError(null);
    if (!addForm.name.trim() || !addForm.email.trim() || !addForm.password) {
      setModalError("Name, email and password are all required");
      return;
    }
    setModalBusy(true);
    const res = await api("/api/admin/admins", {
      method: "POST",
      body: JSON.stringify(addForm),
    });
    setModalBusy(false);
    if (res.ok) {
      setAddOpen(false);
      setAddForm({ name: "", email: "", password: "", role: "SUPPORT" });
      await load();
    } else {
      setModalError(res.message ?? "Could not create the admin account");
    }
  };

  const saveEdit = async () => {
    if (!editRow) return;
    setModalError(null);
    setModalBusy(true);
    const body: Record<string, unknown> = { name: editForm.name.trim(), role: editForm.role };
    if (editForm.password) body.password = editForm.password;
    const res = await api(`/api/admin/admins/${editRow.id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    setModalBusy(false);
    if (res.ok) {
      setEditRow(null);
      setEditForm({ name: "", role: "SUPPORT", password: "" });
      await load();
    } else {
      setModalError(res.message ?? "Could not update the admin account");
    }
  };

  const toggleActive = async (row: AdminRow) => {
    setBusyId(row.id);
    setError(null);
    const res = await api(`/api/admin/admins/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !row.isActive }),
    });
    if (!res.ok) setError(res.message ?? "Could not change account status");
    await load();
    setBusyId(null);
  };

  const confirmDelete = async () => {
    if (!deleteRow) return;
    const res = await api(`/api/admin/admins/${deleteRow.id}`, { method: "DELETE" });
    if (res.ok) {
      setDeleteRow(null);
      await load();
    } else {
      // Close the dialog so the honest server guard message is visible.
      setDeleteRow(null);
      setError(res.message ?? "Could not delete the admin account");
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

      {me && !isSuper && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[0.84rem] text-amber-200">
          <ShieldAlert size={15} className="shrink-0" />
          Your role can view admin accounts, but only Super Admins can add, change or delete them —
          the server rejects anything else.
        </div>
      )}

      <Panel
        title="Admin accounts"
        action={
          <Btn onClick={() => { setModalError(null); setAddOpen(true); }} disabled={!isSuper && me !== null}>
            <UserPlus size={14} /> Add admin
          </Btn>
        }
      >
        {loading ? (
          <div className="flex items-center gap-2 py-10 text-[0.86rem] text-mist-500">
            <Loader2 size={16} className="animate-spin" /> Loading admin accounts…
          </div>
        ) : admins.length === 0 ? (
          <Empty title="No admin accounts" hint="Create the first one with “Add admin”." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Admin</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Last login</Th>
                <Th>Created</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {admins.map((row) => {
                const isSelf = me?.id === row.id;
                return (
                  <tr key={row.id} className="transition hover:bg-white/[0.02]">
                    <Td>
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-[0.75rem] font-bold",
                            row.isActive
                              ? "border-gold-500/30 bg-gold-500/10 text-gold-300"
                              : "border-white/10 bg-white/[0.04] text-mist-500"
                          )}
                        >
                          {getInitials(row.name)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-mist-100">
                            {row.name}
                            {isSelf && <span className="ml-2 text-[0.68rem] uppercase tracking-wide text-gold-400">you</span>}
                          </p>
                          <p className="truncate text-[0.76rem] text-mist-500">{row.email}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <span className={cn("inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-wide", ROLE_STYLE[row.role])}>
                        {roleLabel(row.role)}
                      </span>
                    </Td>
                    <Td>
                      <button
                        onClick={() => toggleActive(row)}
                        disabled={!isSuper || isSelf || busyId === row.id}
                        title={
                          !isSuper
                            ? "Only Super Admins can change account status"
                            : isSelf
                              ? "You cannot deactivate your own account"
                              : row.isActive
                                ? "Click to deactivate"
                                : "Click to activate"
                        }
                        aria-label={row.isActive ? `Deactivate ${row.name}` : `Activate ${row.name}`}
                        className={cn(
                          "relative h-6 w-11 rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50",
                          row.isActive ? "border-gold-500/50 bg-gold-500/25" : "border-white/15 bg-white/[0.06]"
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-all",
                            row.isActive ? "left-[22px] bg-gold-300" : "left-[3px] bg-mist-500"
                          )}
                        />
                      </button>
                      <span className="ml-2 text-[0.74rem] text-mist-500">{row.isActive ? "Active" : "Inactive"}</span>
                    </Td>
                    <Td className="whitespace-nowrap text-mist-500">
                      {row.lastLoginAt ? (
                        <span title={formatDate(row.lastLoginAt)}>{timeAgo(row.lastLoginAt)}</span>
                      ) : (
                        "Never"
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-mist-500">{formatDate(row.createdAt, "short")}</Td>
                    <Td className="text-right">
                      <div className="inline-flex gap-2">
                        <Btn
                          variant="outline"
                          disabled={!isSuper}
                          onClick={() => {
                            setModalError(null);
                            setEditForm({ name: row.name, role: row.role, password: "" });
                            setEditRow(row);
                          }}
                        >
                          <Pencil size={13} /> Edit
                        </Btn>
                        <span title={isSelf ? "You cannot delete your own account" : "Delete this admin"}>
                          <Btn
                            variant="danger"
                            disabled={!isSuper || isSelf}
                            onClick={() => { setError(null); setDeleteRow(row); }}
                          >
                            <Trash2 size={13} />
                          </Btn>
                        </span>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>

      <p className="mt-3 text-[0.76rem] leading-relaxed text-mist-600">
        Roles are enforced per action — creating, changing and deleting admin accounts is restricted
        to Super Admins on the server. What each role may actually do (orders, products, messages,
        settings…) is decided tick-by-tick in <b>Roles &amp; Permissions</b>. Deactivating a Super
        Admin requires another active Super Admin to exist.
      </p>

      {/* ── Add modal ─────────────────────────────────────────────── */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add admin">
        <div className="space-y-4">
          {modalError && (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[0.8rem] text-danger">{modalError}</p>
          )}
          <Field label="Full name">
            <TextInput value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} placeholder="Staff name" />
          </Field>
          <Field label="Email">
            <TextInput
              type="email"
              value={addForm.email}
              onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="name@imalissa.com"
              autoComplete="off"
            />
          </Field>
          <Field label="Password" hint="At least 8 characters, including a letter and a number">
            <TextInput
              type="password"
              value={addForm.password}
              onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Role">
            <Select value={addForm.role} onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value as Role }))}>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label} — {r.desc}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-3 pt-1">
            <Btn variant="outline" onClick={() => setAddOpen(false)}>Cancel</Btn>
            <BusyBtn busy={modalBusy} onClick={create}>
              <Plus size={14} /> Create admin
            </BusyBtn>
          </div>
        </div>
      </Modal>

      {/* ── Edit modal ────────────────────────────────────────────── */}
      <Modal open={editRow !== null} onClose={() => setEditRow(null)} title={editRow ? `Edit ${editRow.name}` : "Edit admin"}>
        <div className="space-y-4">
          {modalError && (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[0.8rem] text-danger">{modalError}</p>
          )}
          <Field label="Full name">
            <TextInput value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Role">
            <Select value={editForm.role} onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value as Role }))}>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label} — {r.desc}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="New password (optional)" hint="Leave blank to keep the current password — at least 8 characters with a letter and a number">
            <TextInput
              type="password"
              value={editForm.password}
              onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
              autoComplete="new-password"
              placeholder="••••••••"
            />
          </Field>
          <div className="flex justify-end gap-3 pt-1">
            <Btn variant="outline" onClick={() => setEditRow(null)}>Cancel</Btn>
            <BusyBtn busy={modalBusy} onClick={saveEdit}>Save changes</BusyBtn>
          </div>
        </div>
      </Modal>

      {/* ── Delete confirmation ───────────────────────────────────── */}
      <ConfirmDialog
        open={deleteRow !== null}
        title="Delete admin account"
        message={
          deleteRow
            ? `Delete ${deleteRow.name} (${deleteRow.email})? Their sessions end immediately. Audit log entries are kept but will no longer show their name.`
            : ""
        }
        confirmLabel="Delete"
        busy={false}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteRow(null)}
      />
    </div>
  );
}
