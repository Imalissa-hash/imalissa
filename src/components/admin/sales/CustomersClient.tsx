"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Panel, Table, Th, Td, Empty, SearchInput, Select } from "@/components/admin/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Pagination } from "@/components/ui/Pagination";
import { formatDate, timeAgo } from "@/lib/utils";

/** One customer row — server-serialized. */
export interface CustomerRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  ordersCount: number;
  totalSpent: number;
  createdAt: string;
}

export function CustomersClient({
  items,
  total,
  totalPages,
  page,
  searchParams,
}: {
  items: CustomerRow[];
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

  const status = get("status");
  const urlQ = get("q");
  const [q, setQ] = useState(urlQ);

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
    router.push(`/admin/customers${qs ? `?${qs}` : ""}`);
  };

  useEffect(() => {
    const t = setTimeout(() => {
      const next = q.trim();
      if (next !== urlQ) push({ q: next || null });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const hasFilters = Boolean(urlQ || status);

  return (
    <div>
      <Panel padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.07] p-5">
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder="Search name, email or phone…"
            className="w-full sm:w-72"
          />
          <Select value={status} onChange={(e) => push({ status: e.target.value })} className="sm:w-44">
            <option value="">All customers</option>
            <option value="ACTIVE">Active</option>
            <option value="BLOCKED">Blocked</option>
          </Select>
          {hasFilters && (
            <button
              onClick={() => {
                setQ("");
                push({ q: null, status: null });
              }}
              className="rounded-lg border border-white/10 px-3 py-2 text-[0.78rem] text-mist-400 transition hover:border-gold-500/40 hover:text-gold-300"
            >
              Clear filters
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="p-5">
            <Empty
              title={hasFilters ? "No customers match your filters" : "No customers yet"}
              hint={
                hasFilters
                  ? "Try a different search term, or clear the filters above."
                  : "Registered accounts will appear here."
              }
            />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Customer</Th>
                <Th>Contact</Th>
                <Th>Joined</Th>
                <Th className="text-right">Orders</Th>
                <Th className="text-right">Total spent</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => router.push(`/admin/customers/${c.id}`)}
                  className="cursor-pointer transition hover:bg-white/[0.03]"
                  title={`Open ${c.name}`}
                >
                  <Td>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gold-500/30 bg-gold-500/10 text-[0.76rem] font-bold text-gold-300">
                        {c.name.slice(0, 1).toUpperCase()}
                      </div>
                      <span className="font-semibold text-mist-100">{c.name}</span>
                    </div>
                  </Td>
                  <Td>
                    <div className="min-w-0">
                      <span className="block truncate text-mist-400">{c.email ?? "—"}</span>
                      <span className="block truncate text-[0.74rem] text-mist-600">
                        {c.phone ?? ""}
                      </span>
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap">
                    <span className="block text-mist-300">{formatDate(c.createdAt, "short")}</span>
                    <span className="block text-[0.72rem] text-mist-600">{timeAgo(c.createdAt)}</span>
                  </Td>
                  <Td className="text-right">{c.ordersCount}</Td>
                  <Td className="whitespace-nowrap text-right font-semibold text-gold-300">
                    ৳{c.totalSpent.toLocaleString("en-US")}
                  </Td>
                  <Td>
                    <StatusBadge status={c.status} dot={false} />
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
        basePath="/admin/customers"
        searchParams={searchParams}
      />
    </div>
  );
}
