import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { withApi, jsonOk, parseBody, rateLimit, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { badRequest } from "@/lib/errors";
import { postCashEntry } from "@/lib/finance";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/cashbook — record money the shop received or spent.
 *
 *     { "type": "EXPENSE", "amount": -1200, "note": "Courier fuel" }
 *
 * `amount` is SIGNED: positive is money in, negative is money out. The UI
 * sends it that way so the stored row and the arithmetic agree — a deposit
 * is never negative and an expense is never positive, enforced below because
 * a mis-click that books money the wrong way is far worse than a 400.
 *
 * Automatic movements (an order marked paid, a refund, a wallet payment) are
 * NOT recorded here — they are posted by the order flow itself, inside the
 * same transaction as the change they describe. This route exists for the
 * money that has no order behind it: the owner's own deposits, shipping and
 * ad costs, and corrections.
 *
 * Guarded by `orders.manage` — the permission that already lets someone change
 * what an order is worth.
 */
const bodySchema = z.object({
  type: z.enum(["DEPOSIT", "EXPENSE", "ADJUSTMENT"]),
  amount: z.number().finite(),
  note: z.string().trim().max(300).optional(),
});

export const POST = withApi(async (req: NextRequest) => {
  const admin = await requirePermission("orders.manage");
  rateLimit(`admin-cashbook:${clientIp(req)}`, 60, 60_000);

  const body = parseBody(bodySchema, await req.json().catch(() => ({})));

  if (body.amount === 0) throw badRequest("Enter a non-zero amount");
  if (body.type === "DEPOSIT" && body.amount < 0) {
    throw badRequest("A deposit is money IN — it cannot be negative");
  }
  if (body.type === "EXPENSE" && body.amount > 0) {
    throw badRequest("An expense is money OUT — it must be negative");
  }

  // Two decimals, from a string: going straight from a JS float to a Decimal
  // can carry 0.30000000000000004 into a money column.
  const value = new Prisma.Decimal(body.amount.toFixed(2));

  // Read-then-write of the running balance must not interleave with another
  // posting, so it happens in one transaction.
  const entry = await prisma.$transaction(async (tx) =>
    postCashEntry(tx, {
      type: body.type,
      amount: value,
      note: body.note || null,
      actorId: admin.id,
    })
  );

  await audit({
    adminId: admin.id,
    action: "CASH_ENTRY_CREATE",
    entityType: "CashEntry",
    entityId: entry.id,
    details: { type: body.type, amount: body.amount },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({
    id: entry.id,
    balanceAfter: entry.balanceAfter.toString(),
  });
});
