import { NextRequest } from "next/server";
import { withApi, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/db";
import { BD_DIVISIONS, BD_AREAS } from "@/lib/delivery";
import { getSettings } from "@/lib/settings";
import { availablePaymentMethods } from "@/server/payment";

/**
 * Everything the checkout form needs in one call:
 * divisions/districts, areas, delivery settings, available payment
 * methods, and the customer's saved addresses (if logged in).
 */
export const GET = withApi(
  async (req: NextRequest) => {
    const settings = await getSettings();
    const methods = await availablePaymentMethods();

    let addresses: unknown[] = [];
    try {
      const { getSessionUser } = await import("@/lib/auth");
      const user = await getSessionUser();
      if (user) {
        addresses = await prisma.address.findMany({
          where: { userId: user.id },
          orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
        });
      }
    } catch {
      /* guest */
    }

    return jsonOk({
      divisions: Object.entries(BD_DIVISIONS).map(([name, districts]) => ({ name, districts })),
      areas: BD_AREAS,
      delivery: {
        default: settings.checkout.deliveryChargeDefault,
        freeDeliveryMin: settings.checkout.freeDeliveryMin,
        charges: settings.checkout.deliveryCharges,
        instructions: settings.checkout.instructions,
      },
      paymentMethods: methods,
      addresses,
    });
  },
  { sameOrigin: false }
);

export const dynamic = "force-dynamic";
