"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import {
  Panel,
  Table,
  Th,
  Td,
  Empty,
  Modal,
  SearchInput,
  Select,
  Btn,
} from "@/components/admin/ui";
import { cn, formatDate, timeAgo } from "@/lib/utils";

/**
 * Audit log browser — client-side fetching against GET /api/admin/audit
 * (q / action prefix / admin filters + pagination). Row click opens the
 * details JSON, which the API already redacts server-side.
 */

interface AuditAdmin {
  id: string;
  name: string;
  email: string;
}

interface AuditItem {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  admin: AuditAdmin | null;
}

interface Meta {
  actions: string[];
  admins: { id: string; name: string }[];
}

/** Colour by the ACTION prefix (PRODUCT_…, ORDER_…, SETTINGS_…). */
const ACTION_TONES: Record<string, string> = {
  ADMIN: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  SETTINGS: "border-gold-500/40 bg-gold-500/10 text-gold-300",
  ORDER: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  PRODUCT: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  CATEGORY: "border-orange-500/30 bg-orange-500/10 text-orange-300",
  COUPON: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  CUSTOMER: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
  USER: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
  REVIEW: "border-teal-500/30 bg-teal-500/10 text-teal-300",
  MESSAGE: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300",
  SYNC: "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
};

const actionTone = (action: string) =>
  ACTION_TONES[action.split("_")[0]] ?? "border-white/15 bg-white/[0.05] text-mist-300";

export function AuditClient() {
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [adminId, setAdminId] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<AuditItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AuditItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        if (action) params.set("action", action);
        if (adminId) params.set("adminId", adminId);
        params.set("page", String(page));

        const res = await fetch(`/api/admin/audit?${params.toString()}`);
        const json = await res.json().catch(() => ({ ok: false, message: "Unexpected server response" }));
        if (cancelled) return;
        if (json.ok) {
          setItems(json.data.items);
          setTotal(json.data.total);
          setTotalPages(json.data.totalPages);
          setMeta({ actions: json.data.actions, admins: json.data.admins });
          setError(null);
        } else {
          setError(json.message ?? "Could not load the audit log");
        }
      } catch {
        if (!cancelled) setError("Network error — could not load the audit log");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [q, action, adminId, page]);

  const resetAnd = (fn: () => void) => {
    setPage(1);
    fn();
  };

  return (
    <div>
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-[0.84rem] text-danger">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <Panel title="Audit log" subtitle={`${total} entries — every admin action is recorded`}>
        {/* Filters */}
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <SearchInput
            value={q}
            onChange={(v) => resetAnd(() => setQ(v))}
            placeholder="Search action / entity…"
          />
          <Select
            value={action}
            onChange={(e) => resetAnd(() => setAction(e.target.value))}
            aria-label="Filter by action"
          >
            <option value="">All actions</option>
            {(meta?.actions ?? []).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
          <Select
            value={adminId}
            onChange={(e) => resetAnd(() => setAdminId(e.target.value))}
            aria-label="Filter by admin"
          >
            <option value="">All admins</option>
            {(meta?.admins ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-[0.86rem] text-mist-500">
            <Loader2 size={16} className="animate-spin" /> Loading audit entries…
          </div>
        ) : items.length === 0 ? (
          <Empty title="No audit entries match these filters" hint="Clear the search or filters to see more." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Time</Th>
                <Th>Admin</Th>
                <Th>Action</Th>
                <Th>Entity</Th>
                <Th>IP</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => setSelected(item)}
                  className="cursor-pointer transition hover:bg-white/[0.03]"
                  title="View details"
                >
                  <Td className="whitespace-nowrap">
                    <span className="block text-mist-300">{formatDate(item.createdAt, "short")}</span>
                    <span className="block text-[0.72rem] text-mist-600">{timeAgo(item.createdAt)}</span>
                  </Td>
                  <Td>
                    {item.admin ? (
                      <div className="min-w-0">
                        <span className="block truncate font-semibold text-mist-100">{item.admin.name}</span>
                        <span className="block truncate text-[0.72rem] text-mist-600">{item.admin.email}</span>
                      </div>
                    ) : (
                      <span className="text-mist-600">— account removed</span>
                    )}
                  </Td>
                  <Td>
                    <span className={cn("inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold tracking-wide", actionTone(item.action))}>
                      {item.action}
                    </span>
                  </Td>
                  <Td>
                    <span className="block truncate text-mist-400">
                      {item.entityType ?? "—"}
                      {item.entityId ? ` · ${item.entityId}` : ""}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap font-mono text-[0.76rem] text-mist-500">{item.ip ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[0.78rem] text-mist-600">
              Page {page} of {totalPages} · {total} entries
            </span>
            <div className="flex gap-2">
              <Btn variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Prev
              </Btn>
              <Btn variant="outline" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
                Next
              </Btn>
            </div>
          </div>
        )}
      </Panel>

      {/* Detail modal */}
      <Modal open={selected !== null} onClose={() => setSelected(null)} title={selected?.action ?? "Audit entry"} wide>
        {selected && (
          <div className="space-y-4">
            <div className="grid gap-2 text-[0.8rem] sm:grid-cols-2">
              <MetaRow label="Time" value={formatDate(selected.createdAt)} />
              <MetaRow label="Admin" value={selected.admin ? `${selected.admin.name} (${selected.admin.email})` : "— account removed"} />
              <MetaRow label="Entity" value={[selected.entityType, selected.entityId].filter(Boolean).join(" · ") || "—"} />
              <MetaRow label="IP" value={selected.ip ?? "—"} />
              <MetaRow label="User agent" value={selected.userAgent ?? "—"} className="sm:col-span-2" />
            </div>
            <div>
              <p className="mb-1.5 text-[0.78rem] font-semibold text-mist-300">
                Details {selected.details && <span className="font-normal text-mist-600">(credentials redacted)</span>}
              </p>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-white/[0.07] bg-black/40 p-3 text-[0.76rem] leading-relaxed text-mist-300">
                {selected.details ?? "No details recorded for this entry."}
              </pre>
            </div>
            <div className="flex justify-end">
              <Btn variant="outline" onClick={() => setSelected(null)}>
                <X size={14} /> Close
              </Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function MetaRow({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2", className)}>
      <span className="block text-[0.68rem] uppercase tracking-[0.14em] text-mist-600">{label}</span>
      <span className="block break-all text-mist-200">{value}</span>
    </div>
  );
}
