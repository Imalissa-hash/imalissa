import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, rateLimit, clientIp } from "@/lib/api";
import { unauthorized } from "@/lib/errors";
import { moveToWishlist } from "@/lib/cart";
import { getSessionUser } from "@/lib/auth";

const schema = z.object({ itemId: z.string().min(1) });

/** Move a cart line to the wishlist (requires login). */
export const POST = withApi(async (req: NextRequest) => {
  rateLimit(`mw:${clientIp(req)}`, 30, 60_000);
  const body = parseBody(schema, await req.json().catch(() => ({})));
  const user = await getSessionUser();
  if (!user) throw unauthorized("Please log in to use your wishlist");

  const cart = await moveToWishlist(user.id, body.itemId);
  const moved = await (async () => {
    // Return the productId that was moved for wishlist state sync.
    const { prisma } = await import("@/lib/db");
    const item = await prisma.wishlist.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: { productId: true },
    });
    return item?.productId ?? "";
  })();

  return jsonOk({ cart, productId: moved });
});
