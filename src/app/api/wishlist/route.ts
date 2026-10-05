import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, rateLimit, clientIp } from "@/lib/api";
import { unauthorized } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { toProductCard } from "@/lib/queries";

const schema = z.object({ productId: z.string().min(1) });

/**
 * Wishlist toggle.  POST { productId } → { active: boolean }
 * Requires login (wishlist is per-account).
 */
export const POST = withApi(async (req: NextRequest) => {
  rateLimit(`wish:${clientIp(req)}`, 60, 60_000);
  const body = parseBody(schema, await req.json().catch(() => ({})));
  const user = await getSessionUser();
  if (!user) throw unauthorized("Please log in to use your wishlist");

  const existing = await prisma.wishlist.findUnique({
    where: { userId_productId: { userId: user.id, productId: body.productId } },
  });

  if (existing) {
    await prisma.wishlist.delete({
      where: { userId_productId: { userId: user.id, productId: body.productId } },
    });
    return jsonOk({ active: false });
  }

  await prisma.wishlist.create({ data: { userId: user.id, productId: body.productId } });
  return jsonOk({ active: true });
});

/** GET → list of wished product ids (for badge + heart states).
 *  Add ?full=1 to receive hydrated product cards (wishlist page). */
export const GET = withApi(async (req: NextRequest) => {
  const user = await getSessionUser();
  if (!user) return jsonOk([] as string[]);

  const full = req.nextUrl.searchParams.get("full") === "1";
  const rows = await prisma.wishlist.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { productId: true },
  });

  if (!full) return jsonOk(rows.map((r) => r.productId));

  // Hydrate in one query (ids preserved in wishlist order).
  const products = await prisma.product.findMany({
    where: { id: { in: rows.map((r) => r.productId) } },
    include: {
      images: { orderBy: { position: "asc" }, take: 1 },
      brand: { select: { name: true } },
      category: { select: { name: true, slug: true } },
    },
  });
  const byId = new Map(products.map((p) => [p.id, toProductCard(p)]));
  const items = rows
    .map((r) => byId.get(r.productId))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return jsonOk(items);
});
