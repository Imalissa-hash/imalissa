"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  Save,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { Panel, Btn, BusyBtn, Checkbox } from "@/components/admin/ui";
import { cn } from "@/lib/utils";

/**
 * Roles & Permissions matrix. Tick permissions one by one per role; the
 * server (requireRole, SUPER_ADMIN only) applies them to every admin
 * holding that role. Super Admin always has everything and cannot be
 * edited here — by design.
 */

type Role = "MANAGER" | "SUPPORT" | "CONTENT";

interface PermDef {
  key: string;
  label: string;
  group: string;
  superOnly?: boolean;
}

interface AdminRow {
  id: string;
  role: string;
}

const ROLE_TABS: { value: Role; label: string; desc: string; style: string }[] = [
  {
    value: "MANAGER",
    label: "Manager",
    desc: "Day-to-day store operations",
    style: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  },
  {
    value: "SUPPORT",
    label: "Support",
    desc: "Customer-facing work",
    style: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  },
  {
    value: "CONTENT",
    label: "Content",
    desc: "Catalog & storefront content",
    style: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  },
];

async function api<T>(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; data?: T; message?: string }> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    const json = await res.json().catch(() => ({ ok: false, message: "Unexpected server response" }));
    return {
      ok: Boolean(json.ok),
      data: json.data as T | undefined,
      message: json.message as string | undefined,
    };
  } catch {
    return { ok: false, message: "Network error — please try again" };
  }
}

export function RolesClient() {
  const [role, setRole] = useState<Role>("MANAGER");
  const [permissions, setPermissions] = useState<PermDef[]>([]);
  const [granted, setGranted] = useState<Record<string, boolean>>({});
  const [configured, setConfigured] = useState(true);
  const [defaults, setDefaults] = useState<string[]>([]);
  const [adminCounts, setAdminCounts] = useState<Record<string, number>>({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /* ── Data ────────────────────────────────────────────────────────── */

  const loadRole = useCallback(async (r: Role) => {
    setLoading(true);
    setDirty(false);
    setNotice(null);
    setError(null);
    const res = await api<{
      role: Role;
      configured: boolean;
      granted: string[];
      defaults: string[];
      permissions: PermDef[];
    }>(`/api/admin/roles?role=${r}`);
    if (res.ok && res.data) {
      const defs = res.data.permissions.filter((p) => !p.superOnly);
      const grantedMap: Record<string, boolean> = {};
      for (const p of defs) grantedMap[p.key] = res.data.granted.includes(p.key);
      setPermissions(defs);
      setGranted(grantedMap);
      setConfigured(res.data.configured);
      setDefaults(res.data.defaults);
    } else {
      setError(res.message ?? "Could not load this role's permissions");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadRole(role);
  }, [role, loadRole]);

  // How many admins currently hold each role (informational).
  useEffect(() => {
    (async () => {
      const res = await api<{ admins: AdminRow[] }>("/api/admin/admins");
      if (res.ok && res.data) {
        const counts: Record<string, number> = {};
        for (const a of res.data.admins) counts[a.role] = (counts[a.role] ?? 0) + 1;
        setAdminCounts(counts);
      }
    })();
  }, []);

  /* ── Editing ─────────────────────────────────────────────────────── */

  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, PermDef[]>();
    for (const p of permissions) {
      if (!map.has(p.group)) {
        map.set(p.group, []);
        order.push(p.group);
      }
      map.get(p.group)!.push(p);
    }
    return order.map((g) => ({ group: g, items: map.get(g)! }));
  }, [permissions]);

  const toggle = (key: string) => {
    setGranted((prev) => ({ ...prev, [key]: !prev[key] }));
    setDirty(true);
    setNotice(null);
  };

  const groupSet = (items: PermDef[], value: boolean) => {
    setGranted((prev) => {
      const next = { ...prev };
      for (const p of items) next[p.key] = value;
      return next;
    });
    setDirty(true);
    setNotice(null);
  };

  const useDefaults = () => {
    const set = new Set(defaults);
    setGranted((prev) => {
      const next: Record<string, boolean> = {};
      for (const p of permissions) next[p.key] = set.has(p.key);
      return next;
    });
    setDirty(true);
    setNotice(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    const keys = Object.entries(granted)
      .filter(([, v]) => v)
      .map(([k]) => k);
    const res = await api<{ role: Role; grantedCount: number }>("/api/admin/roles", {
      method: "PUT",
      body: JSON.stringify({ role, granted: keys }),
    });
    setSaving(false);
    if (res.ok && res.data) {
      setConfigured(true);
      setDirty(false);
      setNotice(
        `Saved — ${res.data.grantedCount} permission${res.data.grantedCount === 1 ? "" : "s"} granted to ${role.replace("_", " ")}. It applies to every admin with this role (their panel refreshes within a minute).`
      );
    } else {
      setError(res.message ?? "Could not save the permissions");
    }
  };

  const grantedCount = Object.values(granted).filter(Boolean).length;

  /* ── Render ──────────────────────────────────────────────────────── */

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
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-[0.84rem] text-emerald-200">
          <CheckCircle2 size={15} className="shrink-0" />
          {notice}
        </div>
      )}

      {/* Role selector */}
      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        {ROLE_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setRole(tab.value)}
            className={cn(
              "rounded-xl border px-4 py-2 text-left transition",
              role === tab.value
                ? tab.style
                : "border-white/10 bg-white/[0.03] text-mist-400 hover:border-white/20"
            )}
          >
            <span className="block text-[0.84rem] font-semibold">{tab.label}</span>
            <span className="block text-[0.7rem] opacity-80">
              {tab.desc}
              {adminCounts[tab.value] ? ` · ${adminCounts[tab.value]} admin${adminCounts[tab.value] === 1 ? "" : "s"}` : ""}
            </span>
          </button>
        ))}
        <span
          className="inline-flex items-center gap-1.5 rounded-xl border border-gold-500/40 bg-gold-500/10 px-4 py-2.5 text-[0.78rem] font-semibold text-gold-300"
          title="Super Admin always has every permission — it cannot be edited or revoked."
        >
          <ShieldCheck size={14} /> Super Admin — full access, always
        </span>
      </div>

      <Panel
        title={`${role.replace("_", " ")} permissions`}
        subtitle={
          configured
            ? `${grantedCount} of ${permissions.length} granted`
            : "Built-in defaults active — nothing saved for this role yet"
        }
        action={
          <div className="flex items-center gap-2">
            <Btn variant="ghost" onClick={useDefaults} disabled={loading}>
              Use defaults
            </Btn>
            <BusyBtn busy={saving} onClick={save} disabled={!dirty || loading}>
              <Save size={14} /> Save
            </BusyBtn>
          </div>
        }
      >
        {loading ? (
          <div className="flex items-center gap-2 py-10 text-[0.86rem] text-mist-500">
            <Loader2 size={16} className="animate-spin" /> Loading permissions…
          </div>
        ) : (
          <div className="space-y-5">
            {!configured && (
              <p className="flex items-start gap-2 rounded-xl border border-sky-500/25 bg-sky-500/[0.07] p-3.5 text-[0.8rem] leading-relaxed text-sky-200/90">
                <Info size={15} className="mt-0.5 shrink-0 text-sky-400" />
                This role has never been configured, so the built-in defaults below are in effect.
                Tick or untick anything, then press <b>Save</b> — from then on only what you save
                is granted.
              </p>
            )}

            {groups.map((g) => (
              <div key={g.group}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-[0.72rem] font-bold uppercase tracking-[0.16em] text-mist-600">
                    {g.group}
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => groupSet(g.items, true)}
                      className="rounded-md px-2 py-0.5 text-[0.7rem] text-mist-500 transition hover:bg-white/[0.06] hover:text-mist-200"
                    >
                      All
                    </button>
                    <button
                      onClick={() => groupSet(g.items, false)}
                      className="rounded-md px-2 py-0.5 text-[0.7rem] text-mist-500 transition hover:bg-white/[0.06] hover:text-mist-200"
                    >
                      None
                    </button>
                  </div>
                </div>
                <div className="grid gap-x-6 gap-y-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 sm:grid-cols-2">
                  {g.items.map((p) => (
                    <Checkbox
                      key={p.key}
                      label={p.label}
                      checked={Boolean(granted[p.key])}
                      onChange={() => toggle(p.key)}
                    />
                  ))}
                </div>
              </div>
            ))}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-4">
              <p className="flex items-center gap-1.5 text-[0.76rem] text-mist-600">
                <Users size={13} /> Applies to every admin whose role is {role.replace("_", " ")}
              </p>
              <div className="flex items-center gap-2">
                {dirty && (
                  <span className="text-[0.76rem] font-medium text-amber-300">Unsaved changes</span>
                )}
                <BusyBtn busy={saving} onClick={save} disabled={!dirty}>
                  <Save size={14} /> Save permissions
                </BusyBtn>
              </div>
            </div>
          </div>
        )}
      </Panel>

      <p className="mt-3 text-[0.76rem] leading-relaxed text-mist-600">
        Enforcement is server-side: a missing permission returns 403 from the API and its page shows
        “Not allowed”, no matter what the menu displays. Creating, editing and deleting admin
        accounts, and editing these permissions, stay Super Admin only.
      </p>
    </div>
  );
}
