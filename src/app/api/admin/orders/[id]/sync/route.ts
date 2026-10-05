import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { badRequest, notFound } from "@/lib/errors";
import {
  syncOrder,
  verifyAmbiguousOrder,
  manualMarkSynced,
  manualReleaseRetry,
  pullOrderStatus,
} from "@/server/external-commerce/sync-order";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const idFrom = async (ctx?: Ctx): Promise<string> => (await ctx?.params)?.id ?? "";

const ACTIONS = ["retry", "verify", "markSynced", "releaseRetry", "pullStatus"] as const;

const bodySchema = z.object({
  action: z.enum(ACTIONS),
  externalOrderId: z.string().trim().min(1).max(120).optional(),
});

const AUDIT_ACTION: Record<(typeof ACTIONS)[number], string> = {
  retry: "SYNC_RETRY",
  verify: "SYNC_VERIFY",
  markSynced: "SYNC_MARK_SYNCED",
  releaseRetry: "SYNC_RELEASE_RETRY",
  pullStatus: "SYNC_PULL_STATUS",
};

const syncSelect = {
  id: true,
  orderNumber: true,
  status: true,
  externalSyncStatus: true,
  externalOrderId: true,
  lastSyncError: true,
  syncAttempts: true,
  syncedAt: true,
} as const;

const logSelect = {
  id: true,
  direction: true,
  status: true,
  attempt: true,
  error: true,
  durationMs: true,
  createdAt: true,
} as const;

async function loadSyncState(id: string) {
  const order = await prisma.order.findUnique({ where: { id }, select: syncSelect });
  if (!order) throw notFound("Order not found");
  const logs = await prisma.apiSyncLog.findMany({
    where: { orderId: id },
    orderBy: { createdAt: "desc" },
    take: 15,
    select: logSelect,
  });
  return {
    sync: {
      externalSyncStatus: order.externalSyncStatus,
      externalOrderId: order.externalOrderId,
      lastSyncError: order.lastSyncError,
      syncAttempts: order.syncAttempts,
      syncedAt: order.syncedAt?.toISOString() ?? null,
    },
    logs: logs.map((l) => ({
      id: l.id,
      direction: l.direction,
      status: l.status,
      attempt: l.attempt,
      error: l.error,
      durationMs: l.durationMs,
      createdAt: l.createdAt.toISOString(),
    })),
    orderNumber: order.orderNumber,
  };
}

/**
 * POST /api/admin/orders/[id]/sync — manual sync actions.
 * All actual sync logic lives in src/server/external-commerce/sync-order.ts;
 * this route only dispatches, audits and reports the HONEST outcome.
 * A failed push is never reported as success.
 */
export const POST = withApi<Ctx>(async (req: NextRequest, ctx?: Ctx) => {
  const admin = await requireAdmin();
  const id = await idFrom(ctx);
  if (!id) throw notFound("Order not found");

  const existing = await prisma.order.findUnique({
    where: { id },
    select: { id: true, orderNumber: true },
  });
  if (!existing) throw notFound("Order not found");

  const body = parseBody(bodySchema, await req.json().catch(() => ({})));

  if (body.action === "markSynced" && !body.externalOrderId) {
    throw badRequest("externalOrderId: Provide the external order ID to mark this order synced");
  }

  let ok = false;
  let outcomeStatus = "";
  let outcomeMessage = "";

  switch (body.action) {
    case "retry": {
      const outcome = await syncOrder(id, "manual");
      outcomeStatus = outcome.status;
      outcomeMessage = outcome.message;
      ok = outcome.status === "SYNCED" || outcome.status === "SKIPPED";
      break;
    }
    case "verify": {
      try {
        const result = await verifyAmbiguousOrder(id);
        ok = true;
        outcomeMessage = result.found
          ? `Verified: the order already exists externally${result.externalOrderId ? ` (ID ${result.externalOrderId})` : ""} — no retry needed.`
          : "Verified: the order does NOT exist externally — retry is now unlocked.";
      } catch (err) {
        throw badRequest(err instanceof Error ? err.message : "Verification failed");
      }
      break;
    }
    case "markSynced": {
      try {
        await manualMarkSynced(id, body.externalOrderId!);
      } catch (err) {
        throw badRequest(err instanceof Error ? err.message : "Could not mark as synced");
      }
      ok = true;
      outcomeMessage = `Marked as synced with external ID ${body.externalOrderId}`;
      break;
    }
    case "releaseRetry": {
      try {
        await manualReleaseRetry(id, admin.id);
      } catch (err) {
        throw badRequest(err instanceof Error ? err.message : "Could not release the retry lock");
      }
      ok = true;
      outcomeMessage =
        "Confirmed as NOT created externally — retry unlocked. Only do this when you verified manually.";
      break;
    }
    case "pullStatus": {
      const result = await pullOrderStatus(id);
      ok = result.ok;
      outcomeMessage = result.message;
      break;
    }
  }

  const state = await loadSyncState(id);
  if (!outcomeStatus) outcomeStatus = state.sync.externalSyncStatus;

  await audit({
    adminId: admin.id,
    action: AUDIT_ACTION[body.action],
    entityType: "Order",
    entityId: id,
    details: {
      orderNumber: state.orderNumber,
      action: body.action,
      ok,
      result: outcomeStatus,
      message: outcomeMessage,
      externalOrderId: body.externalOrderId ?? state.sync.externalOrderId,
    },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({
    action: body.action,
    ok,
    outcome: {
      status: outcomeStatus,
      message: outcomeMessage,
      externalOrderId: state.sync.externalOrderId,
    },
    sync: state.sync,
    logs: state.logs,
  });
});
