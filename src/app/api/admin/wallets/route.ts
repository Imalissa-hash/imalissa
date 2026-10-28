import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { withApi, jsonOk, parseBody, rateLimit, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { badRequest } from "@/lib/errors";
import { postWalletEntry, walletBalance } from "@/lib/finance";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/wallets — move a customer's wallet balance.
 *
 *     { "userId": "…", "type": "TOPUP", "amount": 500, "note": "Goodwill" }
 *
 * `amount` is SIGNED: positive credits the customer, negative debits. A
 * deposit is never negative and a withdrawal never positive — enforced below
 * so a reversed click cannot silently book the opposite direction.
 *
 * Refunds and order payments are NOT recorded here either: those are posted
 * by the order flow in the same transaction as the order, so the wallet can
 * never be credited for a refund that did not actually happen.
 *
 * Guarded by `customers.manage` — the permission that already covers editing
 * a customer's account.
 */
const bodySchema = z.object({
  userId: z.string().min(1, "Pick a customer"),
  type: z.enum(["TOPUP", "WITHDRAW", "ADJUSTMENT"]),
  amount: z.number().finite(),
  note: z.string().trim().max(300).optional(),
});

export const POST = withApi(async (req: NextRequest) => {
  const admin = await requirePermission("customers.manage");
  rateLimit(`admin-wallet:${clientIp(req)}`, 60, 60_000);

  const body = parseBody(bodySchema, await req.json().catch(() => ({})));

  if (body.amount === 0) throw badRequest("Enter a non-zero amount");
  if (body.type === "TOPUP" && body.amount < 0) {
    throw badRequest("A top-up adds credit — it cannot be negative");
  }
  if (body.type === "WITHDRAW" && body.amount > 0) {
    throw badRequest("A withdrawal removes credit — it must be negative");
  }

  const customer = await prisma.user.findUnique({
    where: { id: body.userId },
    select: { id: true, name: true, email: true, phone: true },
  });
  if (!customer) throw badRequest("That customer no longer exists");

  const value = new Prisma.Decimal(body.amount.toFixed(2));

  const entry = await prisma.$transaction(async (tx) => {
    try {
      return await postWalletEntry(tx, {
        userId: body.userId,
        type: body.type,
        amount: value,
        note: body.note || null,
        actorId: admin.id,
      });
    } catch (err) {
      // The guard in postWalletEntry — a balance must never go below zero,
      // because that would owe a customer money the shop does not have.
      if (err instanceof Error && err.message === "WALLET_OVERDRAW") {
        const current = await walletBalance(tx, body.userId);
        throw badRequest(
          `That would take the balance to ${current.plus(value).toFixed(2)} — below zero. ` +
            `Available: ${current.toFixed(2)}.`
        );
      }
      throw err;
    }
  });

  await audit({
    adminId: admin.id,
    action: "WALLET_ENTRY_CREATE",
    entityType: "WalletEntry",
    entityId: entry.id,
    details: { userId: body.userId, type: body.type, amount: body.amount },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({
    id: entry.id,
    balanceAfter: entry.balanceAfter.toString(),
    customer,
  });
});
