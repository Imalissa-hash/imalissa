import type { Metadata } from "next";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { LoginsClient, type LoginRow } from "@/components/admin/sales/LoginsClient";
import { pageGuard } from "@/components/admin/AccessDenied";

export const metadata: Metadata = {
  title: "Logins",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const VIEWS = ["ALL", "SIGNED_IN", "NEVER"] as const;

/**
 * Admin → Logins: every registered account, when it last signed in, and
 * whether it is signed in right now, with a button to sign it out.
 *
 * Read-only with respect to the account itself — the row action ends
 * sessions, it never deletes the customer (see the DELETE route for why
 * those two must not share a button).
 *
 * Server-rendered from searchParams, exactly like the Customers list: no
 * client fetch, so the page paints with its data already in hand.
 */
export default async function AdminLoginsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const denied = await pageGuard("customers.view");
  if (denied) return denied;

  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v : "";
  };

  const q = one("q").trim();
  const view = (VIEWS as readonly string[]).includes(one("view"))
    ? one("view")
    : "ALL";
  const page = Math.min(
    Math.max(1, Math.floor(Number(one("page")) || 1)),
    100_000
  );
  const skip = (page - 1) * PAGE_SIZE;
  const now = new Date();

  // Filters are composed as fragments so the same `where` drives both the
  // page query and the count — they can never drift apart.
  const filters: Prisma.Sql[] = [];
  if (q) {
    const like = `%${q}%`;
    filters.push(
      Prisma.sql`(u.name LIKE ${like} OR u.email LIKE ${like} OR u.phone LIKE ${like})`
    );
  }
  if (view === "SIGNED_IN") {
    filters.push(
      Prisma.sql`EXISTS (SELECT 1 FROM \`Session\` sa WHERE sa.userId = u.id AND sa.expiresAt > ${now})`
    );
  } else if (view === "NEVER") {
    filters.push(
      Prisma.sql`NOT EXISTS (SELECT 1 FROM \`Session\` sa WHERE sa.userId = u.id)`
    );
  }
  const where = filters.length
    ? Prisma.sql`WHERE ${Prisma.join(filters, " AND ")}`
    : Prisma.empty;

  // Three correlated lookups rather than a JOIN+GROUP BY: each one is an
  // index hit on Session.userId, and COUNT(*) is a plain BIGINT — so the
  // numbers arrive as BigInt with no DECIMAL/Decimal coercion to guess at.
  const [countRows, rows] = await Promise.all([
    prisma.$queryRaw<{ c: number | bigint }[]>(
      Prisma.sql`SELECT COUNT(*) AS c FROM \`User\` u ${where}`
    ),
    prisma.$queryRaw<LoginRow[]>(
      Prisma.sql`
        SELECT
          u.id        AS id,
          u.name      AS name,
          u.email     AS email,
          u.phone     AS phone,
          u.status    AS status,
          u.createdAt AS createdAt,
          (SELECT MAX(s.createdAt) FROM \`Session\` s
             WHERE s.userId = u.id)                     AS lastLoginAt,
          (SELECT COUNT(*) FROM \`Session\` s
             WHERE s.userId = u.id)                     AS sessionCount,
          (SELECT COUNT(*) FROM \`Session\` s
             WHERE s.userId = u.id AND s.expiresAt > ${now}) AS activeSessions
        FROM \`User\` u
        ${where}
        ORDER BY lastLoginAt DESC, u.createdAt DESC
        LIMIT ${Prisma.raw(String(PAGE_SIZE))}
        OFFSET ${Prisma.raw(String(skip))}
      `
    ),
  ]);

  const total = Number(countRows[0]?.c ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const items: LoginRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    status: String(r.status),
    createdAt: new Date(r.createdAt).toISOString(),
    lastLoginAt: r.lastLoginAt ? new Date(r.lastLoginAt).toISOString() : null,
    sessionCount: Number(r.sessionCount ?? 0),
    activeSessions: Number(r.activeSessions ?? 0),
  }));

  const signedIn = items.reduce((n, r) => n + (r.activeSessions > 0 ? 1 : 0), 0);

  return (
    <div>
      <AdminPageHeader
        title="Logins"
        subtitle={
          view === "ALL"
            ? `${total.toLocaleString()} account${total === 1 ? "" : "s"} — ${signedIn} signed in on this page`
            : `${total.toLocaleString()} account${total === 1 ? "" : "s"} in this view`
        }
      />
      <LoginsClient
        items={items}
        total={total}
        totalPages={totalPages}
        page={page}
        searchParams={sp}
      />
    </div>
  );
}
