import { NextRequest } from "next/server";
import { withApi, jsonOk, rateLimit, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ORDER_STATUS_LABELS, statusStepIndex, ORDER_STATUS_FLOW } from "@/lib/order";
import { badRequest } from "@/lib/errors";

/**
 * Public order tracking.
 *   GET /api/track?orderNumber=IMAL-2026-000001&contact=017… | email@…
 *
 * Requires order number + matching phone/email — order details are never
 * exposed by number alone.
 */
export const GET = withApi(
  async (req: NextRequest) => {
    rateLimit(`track:${clientIp(req)}`, 15, 60_000);

    const orderNumber = (req.nextUrl.searchParams.get("orderNumber") ?? "").trim().toUpperCase();
    const contact = (req.nextUrl.searchParams.get("contact") ?? "").trim().toLowerCase();

    if (!orderNumber || !contact) {
      throw badRequest("Enter your order number and phone/email");
    }

    const order = await prisma.order.findUnique({
      where: { orderNumber },
      include: {
        items: { select: { productName: true, quantity: true, image: true, variantLabel: true, lineTotal: true } },
      },
    });

    // A soft-deleted order is gone for the customer as well.
    if (!order || order.deletedAt) throw badRequest("No order found with that order number");

    const phone = order.customerPhone?.toLowerCase() ?? "";
    const email = order.customerEmail?.toLowerCase() ?? "";
    const guestEmail = (order.guestEmail ?? "").toLowerCase();

    const matches =
      contact === phone ||
      (email && contact === email) ||
      (guestEmail && contact === guestEmail);

    if (!matches) throw badRequest("The phone/email does not match this order");

    const placedAt = order.placedAt;
    const timeline = ORDER_STATUS_FLOW.map((s) => ({
      key: s,
      label: ORDER_STATUS_LABELS[s] ?? s,
      active: statusStepIndex(order.status) >= statusStepIndex(s),
    }));

    const address = order.address as Record<string, string | null>;

    return jsonOk({
      orderNumber: order.orderNumber,
      status: order.status,
      statusLabel: ORDER_STATUS_LABELS[order.status] ?? order.status,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      total: Number(order.total),
      placedAt: placedAt.toISOString(),
      deliveredAt: order.deliveredAt?.toISOString() ?? null,
      timeline,
      cancelled: ["CANCELLED", "RETURNED", "FAILED"].includes(order.status),
      trackingNumber: order.trackingNumber,
      trackingUrl: order.trackingUrl,
      items: order.items.map((i) => ({
        name: i.productName,
        quantity: i.quantity,
        image: i.image,
        variantLabel: i.variantLabel,
        lineTotal: Number(i.lineTotal),
      })),
      delivery: {
        district: address?.district ?? null,
        area: address?.area ?? null,
        fullAddress: address?.fullAddress ?? null,
      },
      // Public-safe external sync summary (no payloads/secrets).
      external: {
        status: order.externalSyncStatus,
        synced: order.externalSyncStatus === "SYNCED",
      },
    });
  },
  { sameOrigin: false }
);

export const dynamic = "force-dynamic";
