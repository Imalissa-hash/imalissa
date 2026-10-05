"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Panel, Table, Th, Td, Empty, SearchInput, Tabs } from "@/components/admin/ui";
import { Pagination } from "@/components/ui/Pagination";
import { cn, formatDate, timeAgo } from "@/lib/utils";

/** One contact message row — server-serialized. */
export interface MessageRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  subject: string;
  preview: string;
  isRead: boolean;
  archived: boolean;
  createdAt: string;
}

export interface MessageCounts {
  inbox: number;
  unread: number;
  archived: number;
}

const BOXES = [
  { key: "", label: "Inbox" },
  { key: "unread", label: "Unread" },
  { key: "archived", label: "Archived" },
  { key: "all", label: "All" },
];

export function MessagesClient({
  items,
  total,
  totalPages,
  page,
  searchParams,
  counts,
}: {
  items: MessageRow[];
  total: number;
  totalPages: number;
  page: number;
  searchParams: Record<string, string | string[] | undefined>;
  counts: MessageCounts;
}) {
  const router = useRouter();
  const get = (k: string) => {
    const v = searchParams[k];
    return typeof v === "string" ? v : "";
  };

  const box = get("box");
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
    router.push(`/admin/messages${qs ? `?${qs}` : ""}`);
  };

  useEffect(() => {
    const t = setTimeout(() => {
      const next = q.trim();
      if (next !== urlQ) push({ q: next || null });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const countFor = (key: string) =>
    key === "" ? counts.inbox : key === "unread" ? counts.unread : key === "archived" ? counts.archived : total;

  const hasFilters = Boolean(urlQ || box);

  return (
    <div>
      <Panel padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] p-5">
          <Tabs
            tabs={BOXES.map((b) => ({ key: b.key, label: b.label, count: countFor(b.key) }))}
            active={box}
            onChange={(key) => push({ box: key || null })}
          />
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder="Search name, subject or message…"
            className="w-full sm:w-72"
          />
        </div>

        {items.length === 0 ? (
          <div className="p-5">
            <Empty
              title={hasFilters ? "No messages match your filters" : "No messages yet"}
              hint={
                hasFilters
                  ? "Try a different search term, or switch tabs above."
                  : "Messages sent through the storefront contact form land here."
              }
            />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>From</Th>
                <Th>Subject</Th>
                <Th>Received</Th>
                <Th>State</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => {
                const unread = !m.isRead && !m.archived;
                return (
                  <tr
                    key={m.id}
                    onClick={() => router.push(`/admin/messages/${m.id}`)}
                    className={cn(
                      "cursor-pointer transition hover:bg-white/[0.03]",
                      m.archived && "opacity-60"
                    )}
                    title="Open message"
                  >
                    <Td>
                      <div className="min-w-0">
                        <span
                          className={cn(
                            "block truncate",
                            unread ? "font-bold text-mist-50" : "font-semibold text-mist-300"
                          )}
                        >
                          {m.name}
                        </span>
                        <span className="block truncate text-[0.74rem] text-mist-600">
                          {[m.email, m.phone].filter(Boolean).join(" · ") || "No contact details"}
                        </span>
                      </div>
                    </Td>
                    <Td>
                      <div className="min-w-0">
                        <span
                          className={cn(
                            "block truncate",
                            unread ? "font-semibold text-gold-200" : "text-mist-300"
                          )}
                        >
                          {unread && (
                            <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-gold-400 align-middle" />
                          )}
                          {m.subject}
                        </span>
                        <span className="block truncate text-[0.74rem] text-mist-600">
                          {m.preview}
                        </span>
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap">
                      <span className="block text-mist-300">{formatDate(m.createdAt, "short")}</span>
                      <span className="block text-[0.72rem] text-mist-600">{timeAgo(m.createdAt)}</span>
                    </Td>
                    <Td>
                      <span
                        className={cn(
                          "inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-wide",
                          m.archived
                            ? "border-white/15 bg-white/[0.05] text-mist-400"
                            : unread
                              ? "border-gold-500/40 bg-gold-500/10 text-gold-300"
                              : "border-success/30 bg-success/10 text-success"
                        )}
                      >
                        {m.archived ? "Archived" : unread ? "Unread" : "Read"}
                      </span>
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
        basePath="/admin/messages"
        searchParams={searchParams}
      />
    </div>
  );
}
