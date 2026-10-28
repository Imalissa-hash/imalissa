import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { pageGuard } from "@/components/admin/AccessDenied";
import { getAdmin } from "@/lib/admin-auth";
import { canAccess } from "@/lib/permissions";
import { cashBalance, cashTotals } from "@/lib/finance";
import { CashBookClient } from "@/components/admin/finance/CashBookClient";

export const metadata: Metadata = {
  title: "Cash Book",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const MAX_ROWS = 300;

/**
 * Admin → Cash Book — money in and money out, with the running balance.
 *
 * The balance is read from the LAST entry's `balanceAfter` rather than summed
 * over the whole table: the ledger only ever grows, and one indexed lookup
 * beats a SUM() that gets slower every day.
 *
 * Today's and this month's totals are computed over the entries in that
 * window only — the header answers "how much came in today?" without
 * scanning history, and the balance card answers "what do we have?".
 *
 * Reads under `orders.view` (money is sales). Writing an entry needs
 * `orders.manage`, checked in the API.
 */
export default async function AdminCashBookPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const denied = await pageGuard("orders.view");
  if (denied) return denied;

  // Who is looking decides whether the entry form renders at all — the API
  // enforces it regardless, so this only spares a read-only admin a form
  // that would 403 on submit.
  const admin = await getAdmin();
  const canWrite = admin ? await canAccess(admin, "orders.manage") : false;

  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v : "";
  };

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);
  endOfDay.setMilliseconds(-1);

  const startOfMonth = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1);

  const [balance, today, month] = await Promise.all([
    cashBalance(prisma),
    cashTotals(prisma, startOfDay, endOfDay),
    cashTotals(prisma, startOfMonth, endOfDay),
  ]);

  // Optional range filter — both ends inclusive of the whole day.
  const fromRaw = one("from");
  const toRaw = one("to");
  const from = /^\d{4}-\d{2}-\d{2}$/.test(fromRaw) ? new Date(`${fromRaw}T00:00:00`) : null;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(toRaw) ? new Date(`${toRaw}T23:59:59.999`) : null;

  const entries = await prisma.cashEntry.findMany({
    where: {
      ...(from || to
        ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MAX_ROWS,
    include: {
      order: { select: { orderNumber: true } },
    },
  });

  const rows = entries.map((e) => ({
    id: e.id,
    type: e.type,
    amount: e.amount.toString(),
    balanceAfter: e.balanceAfter.toString(),
    note: e.note,
    orderNumber: e.order?.orderNumber ?? null,
    createdAt: e.createdAt.toISOString(),
  }));

  return (
    <div>
      <AdminPageHeader
        title="Cash Book"
        subtitle="Every baht the shop has taken in or paid out. Deposits and expenses are added here; orders and refunds post themselves."
      />
      <CashBookClient
        balance={balance.toString()}
        todayIn={today.inAmount.toString()}
        todayOut={today.outAmount.toString()}
        monthIn={month.inAmount.toString()}
        monthOut={month.outAmount.toString()}
        monthCount={month.count}
        rows={rows}
        from={fromRaw}
        to={toRaw}
        truncated={entries.length === MAX_ROWS}
        canWrite
      />
    </div>
  );
}
