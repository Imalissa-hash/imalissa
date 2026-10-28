import { Prisma } from "@prisma/client";
import type { WalletEntryType, CashEntryType } from "@prisma/client";

/**
 * Customer wallet + shop cash book.
 *
 * Both ledgers are APPEND-ONLY. A balance is never written in place and a row
 * is never edited: a mistake is corrected by posting the opposite entry, so
 * the rows always add up to the figure shown on screen and the history of how
 * a balance got to where it is stays readable.
 *
 * Every row carries `balanceAfter` — the running balance at the moment it was
 * posted (the InventoryLog shape, already proven elsewhere in this schema).
 * Reading a balance is therefore ONE indexed lookup instead of SUM() over a
 * table that grows with every order, and a statement can show the balance
 * after each line without recomputing anything.
 *
 * The read-then-write below MUST happen inside a transaction: two admins
 * topping up the same customer at the same instant would otherwise both read
 * the same starting balance and one entry would be lost. Callers pass the tx
 * they are already in (see the order hooks), so posting costs no extra round
 * trip.
 */

/** The client Prisma hands to an interactive transaction callback. */
export type LedgerDb = Prisma.TransactionClient;

export const zero = new Prisma.Decimal(0);

/** Newest-first: createdAt alone can tie, so id breaks the tie deterministically. */
const ORDER_NEWEST: [{ createdAt: "desc" }, { id: "desc" }] = [{ createdAt: "desc" }, { id: "desc" }];

/* ── Wallet ─────────────────────────────────────────────────────── */

/** The customer's current wallet balance (0 when they have never had one). */
export async function walletBalance(db: LedgerDb, userId: string): Promise<Prisma.Decimal> {
  const last = await db.walletEntry.findFirst({
    where: { userId },
    orderBy: ORDER_NEWEST,
    select: { balanceAfter: true },
  });
  return last ? last.balanceAfter : zero;
}

export type WalletPost = {
  userId: string;
  type: WalletEntryType;
  /** Signed: positive credits the customer, negative debits it. */
  amount: Prisma.Decimal | number;
  orderId?: string | null;
  note?: string | null;
  actorId?: string | null;
};

/**
 * Append one wallet entry and return the new balance.
 *
 * Rejects a negative resulting balance. Allowing one would mean the shop owed
 * a customer money it never had, and the error would surface much later as a
 * cash book that does not add up.
 */
export async function postWalletEntry(
  db: LedgerDb,
  { userId, type, amount, orderId = null, note = null, actorId = null }: WalletPost
) {
  const value = amount instanceof Prisma.Decimal ? amount : new Prisma.Decimal(amount);
  const next = (await walletBalance(db, userId)).plus(value);

  if (next.isNegative()) {
    throw new Error("WALLET_OVERDRAW");
  }

  return db.walletEntry.create({
    data: { userId, type, amount: value, balanceAfter: next, orderId, note, actorId },
  });
}

/* ── Cash book ──────────────────────────────────────────────────── */

/** The shop's current cash balance — every entry added up. */
export async function cashBalance(db: LedgerDb): Promise<Prisma.Decimal> {
  const last = await db.cashEntry.findFirst({
    orderBy: ORDER_NEWEST,
    select: { balanceAfter: true },
  });
  return last ? last.balanceAfter : zero;
}

export type CashPost = {
  type: CashEntryType;
  /** Signed: positive is money in, negative is money out. */
  amount: Prisma.Decimal | number;
  orderId?: string | null;
  userId?: string | null;
  note?: string | null;
  actorId?: string | null;
};

/** Append one cash-book entry and return the new balance. */
export async function postCashEntry(
  db: LedgerDb,
  { type, amount, orderId = null, userId = null, note = null, actorId = null }: CashPost
) {
  const value = amount instanceof Prisma.Decimal ? amount : new Prisma.Decimal(amount);
  const next = (await cashBalance(db)).plus(value);

  return db.cashEntry.create({
    data: { type, amount: value, balanceAfter: next, orderId, userId, note, actorId },
  });
}

/* ── Reporting ──────────────────────────────────────────────────── */

/** Totals for a date range, used by the cash book header. */
export async function cashTotals(db: LedgerDb, from: Date, to: Date) {
  const rows = await db.cashEntry.findMany({
    where: { createdAt: { gte: from, lte: to } },
    select: { amount: true },
  });

  let inAmount = zero;
  let outAmount = zero;
  for (const r of rows) {
    if (r.amount.isNegative()) outAmount = outAmount.plus(r.amount.abs());
    else inAmount = inAmount.plus(r.amount);
  }
  return { inAmount, outAmount, count: rows.length };
}
