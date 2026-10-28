import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { pageGuard } from "@/components/admin/AccessDenied";
import { getAdmin } from "@/lib/admin-auth";
import { canAccess } from "@/lib/permissions";
import { WalletsClient } from "@/components/admin/finance/WalletsClient";

export const metadata: Metadata = {
  title: "Customer Wallets",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const TAKE = 50;

/**
 * Admin → Customer Wallets — balances, top-ups, withdrawals and statements.
 *
 * A balance is the `balanceAfter` of that customer's NEWEST entry, not a sum
 * over their history: the ledger only grows, so one indexed lookup per
 * customer keeps this page the same speed next year as it is today.
 *
 * Without a search term the list shows everyone who has wallet activity.
 * Searching widens it to ANY customer — someone who has never had a balance
 * can be found and topped up without a separate screen.
 *
 * Reads under `customers.view`; moving money needs `customers.manage`,
 * enforced in the API.
 */
export default async function AdminWalletsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const denied = await pageGuard("customers.view");
  if (denied) return denied;

  const admin = await getAdmin();
  const canWrite = admin ? await canAccess(admin, "customers.manage") : false;

  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v : "";
  };
  const q = one("q").trim();
  const selectedId = one("u").trim();

  // Which customers to show.
  let userIds: string[];
  if (q) {
    const found = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: q } },
          { phone: { contains: q } },
          { email: { contains: q } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: TAKE,
      select: { id: true },
    });
    userIds = found.map((u) => u.id);
  } else {
    const holders = await prisma.walletEntry.findMany({
      distinct: ["userId"],
      take: TAKE,
      select: { userId: true },
    });
    userIds = holders.map((h) => h.userId);
  }

  // Balances: newest entry per customer, in one query.
  const balances = new Map<string, { amount: string; at: Date }>();
  if (userIds.length > 0) {
    const recent = await prisma.walletEntry.findMany({
      where: { userId: { in: userIds } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { userId: true, balanceAfter: true, createdAt: true },
    });
    for (const e of recent) {
      if (!balances.has(e.userId)) {
        balances.set(e.userId, { amount: e.balanceAfter.toString(), at: e.createdAt });
      }
    }
  }

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, email: true, phone: true },
  });

  const rows = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    balance: balances.get(u.id)?.amount ?? "0",
    lastMovedAt: balances.get(u.id)?.at.toISOString() ?? null,
  }));

  // Statement for the selected customer.
  let statement: {
    customer: { id: string; name: string; email: string | null; phone: string | null };
    rows: {
      id: string;
      type: string;
      amount: string;
      balanceAfter: string;
      note: string | null;
      orderNumber: string | null;
      createdAt: string;
    }[];
  } | null = null;

  if (selectedId) {
    const customer = await prisma.user.findUnique({
      where: { id: selectedId },
      select: { id: true, name: true, email: true, phone: true },
    });
    if (customer) {
      const entries = await prisma.walletEntry.findMany({
        where: { userId: selectedId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 200,
        include: { order: { select: { orderNumber: true } } },
      });
      statement = {
        customer,
        rows: entries.map((e) => ({
          id: e.id,
          type: e.type,
          amount: e.amount.toString(),
          balanceAfter: e.balanceAfter.toString(),
          note: e.note,
          orderNumber: e.order?.orderNumber ?? null,
          createdAt: e.createdAt.toISOString(),
        })),
      };
    }
  }

  return (
    <div>
      <AdminPageHeader
        title="Customer Wallets"
        subtitle="Store credit held for each customer. Refunds can be credited here, and it can be spent on an order."
      />
      <WalletsClient
        rows={rows}
        statement={statement}
        query={q}
        canWrite={canWrite}
        truncated={userIds.length === TAKE}
      />
    </div>
  );
}
