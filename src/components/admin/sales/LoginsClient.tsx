"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Panel,
  Table,
  Th,
  Td,
  Empty,
  SearchInput,
  Select,
  Btn,
  BusyBtn,
  ConfirmDialog,
} from "@/components/admin/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Pagination } from "@/components/ui/Pagination";
import { formatDate, timeAgo } from "@/lib/utils";

/** One account's login state — server-serialized by /admin/logins. */
export interface LoginRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
  /** Last time this account created a session. null = never signed in. */
  lastLoginAt: string | null;
  /** Total sessions ever created (including ones that have since expired). */
  sessionCount: number;
  /** Sessions whose expiresAt is still in the future — i.e. signed in now. */
  activeSessions: number;
}

export function LoginsClient({
  items,
  total,
  totalPages,
  page,
  searchParams,
}: {
  items: LoginRow[];
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

  const view = get("view");
  const urlQ = get("q");
  const [q, setQ] = useState(urlQ);

  const [signingOut, setSigningOut] = useState<LoginRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    router.push(`/admin/logins${qs ? `?${qs}` : ""}`);
  };

  useEffect(() => {
    const t = setTimeout(() => {
      const next = q.trim();
      if (next !== urlQ) push({ q: next || null });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const hasFilters = Boolean(urlQ || view);

  /**
   * Ends the customer's sessions. It deliberately does NOT touch the
   * account — the confirm copy says so in plain words, because "Delete"
   * next to a customer row is one mis-read away from destroying order
   * history that a supplier has already been paid against.
   */
  const confirmSignOut = async () => {
    if (!signingOut) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/logins/${signingOut.id}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        data?: { sessionsEnded: number };
      };
      if (!res.ok) {
        setError(data.message || "Could not sign them out — please try again.");
        return;
      }
      setSigningOut(null);
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Panel padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.07] p-5">
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder="Search name, gmail or phone…"
            className="w-full sm:w-72"
          />
          <Select
            value={view}
            onChange={(e) => push({ view: e.target.value })}
            className="sm:w-52"
          >
            <option value="">All accounts</option>
            <option value="SIGNED_IN">Signed in now</option>
            <option value="NEVER">Never signed in</option>
          </Select>
          {hasFilters && (
            <button
              onClick={() => {
                setQ("");
                push({ q: null, view: null });
              }}
              className="rounded-lg border border-white/10 px-3 py-2 text-[0.78rem] text-mist-400 transition hover:border-gold-500/40 hover:text-gold-300"
            >
              Clear filters
            </button>
          )}
        </div>

        {error && (
          <p className="border-b border-red-500/20 bg-red-500/10 px-5 py-2.5 text-xs text-red-300">
            {error}
          </p>
        )}

        {items.length === 0 ? (
          <div className="p-5">
            <Empty
              title={hasFilters ? "No accounts match your filters" : "No accounts yet"}
              hint={
                hasFilters
                  ? "Try a different search term, or clear the filters above."
                  : "Registered accounts will appear here once customers sign up."
              }
            />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Account</Th>
                <Th>Gmail / contact</Th>
                <Th>Last login</Th>
                <Th className="text-right">Sessions</Th>
                <Th>Status</Th>
                <Th className="text-right">Action</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const signedInNow = r.activeSessions > 0;
                return (
                  <tr key={r.id} className="transition hover:bg-white/[0.03]">
                    <Td>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gold-500/30 bg-gold-500/10 text-[0.76rem] font-bold text-gold-300">
                          {r.name.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <span className="block truncate font-semibold text-mist-100">
                            {r.name}
                          </span>
                          <span className="block truncate text-[0.72rem] text-mist-600">
                            joined {formatDate(r.createdAt, "short")}
                          </span>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <div className="min-w-0">
                        <span className="block truncate text-mist-400">
                          {r.email ?? "—"}
                        </span>
                        <span className="block truncate text-[0.74rem] text-mist-600">
                          {r.phone ?? ""}
                        </span>
                      </div>
                    </Td>
                    {/* data-lastlogin lets tests read this row's state without
                        colliding with the filter dropdown, which also carries
                        the literal words "Never signed in". */}
                    <Td className="whitespace-nowrap">
                      <span
                        data-lastlogin={r.lastLoginAt ? "set" : "never"}
                        className="block"
                      >
                      {r.lastLoginAt ? (
                        <>
                          <span className="block text-mist-300">
                            {formatDate(r.lastLoginAt, "short")}
                          </span>
                          <span className="block text-[0.72rem] text-mist-600">
                            {timeAgo(r.lastLoginAt)}
                          </span>
                        </>
                      ) : (
                        <span className="text-[0.78rem] italic text-mist-600">
                          Never signed in
                        </span>
                      )}
                      </span>
                    </Td>
                    <Td className="text-right">
                      <span
                        className={`inline-flex items-center justify-center rounded-lg px-2 py-1 text-[0.76rem] font-semibold ${
                          signedInNow
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-white/[0.06] text-mist-500"
                        }`}
                        title={
                          signedInNow
                            ? `${r.activeSessions} live session${r.activeSessions === 1 ? "" : "s"}`
                            : "Not signed in"
                        }
                      >
                        {signedInNow ? `${r.activeSessions} live` : "0 live"}
                      </span>
                      <span className="ml-1.5 text-[0.7rem] text-mist-600">
                        {r.sessionCount} total
                      </span>
                    </Td>
                    <Td>
                      <StatusBadge status={r.status} dot={false} />
                    </Td>
                    <Td className="text-right">
                      {signedInNow ? (
                        <Btn variant="danger" onClick={() => setSigningOut(r)}>
                          Sign out
                        </Btn>
                      ) : (
                        <span className="text-[0.76rem] text-mist-600">—</span>
                      )}
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
        basePath="/admin/logins"
        searchParams={searchParams}
      />

      <ConfirmDialog
        open={Boolean(signingOut)}
        title="Sign this customer out?"
        message={
          signingOut
            ? `${signingOut.name} (${signingOut.email ?? "no gmail"}) will be logged out of ${
                signingOut.activeSessions
              } device${signingOut.activeSessions === 1 ? "" : "s"}. Their account, orders, reviews and messages stay exactly as they are — they can simply sign back in.`
            : ""
        }
        confirmLabel="Sign out"
        busy={busy}
        onConfirm={confirmSignOut}
        onCancel={() => {
          setSigningOut(null);
          setError(null);
        }}
      />
    </div>
  );
}
