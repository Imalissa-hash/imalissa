import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, rateLimit, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { cookies } from "next/headers";
import { toProductCard } from "@/lib/queries";
import { cookieSecure } from "@/lib/utils";

const schema = z.object({ productId: z.string().min(1) });

/**
 * Record a product view (guest → session cookie, login → user id)
 * and GET the viewer's recently viewed products.
 */
export const POST = withApi(async (req: NextRequest) => {
  const body = parseBody(schema, await req.json().catch(() => ({})));
  const user = await getSessionUser();

  const store = await cookies();
  let guest = store.get("imalissa_guest")?.value;
  if (!guest) {
    const { randomBytes } = await import("crypto");
    guest = randomBytes(16).toString("hex");
    store.set("imalissa_guest", guest, {
      httpOnly: true,
      sameSite: "lax",
      secure: cookieSecure(),
      path: "/",
      maxAge: 60 * 60 * 24 * 180,
    });
  }

  try {
    // Keep max 20 rows per viewer — cheap upsert pattern.
    const existing = await prisma.recentlyViewed.findFirst({
      where: { sessionId: guest, productId: body.productId },
    });
    if (existing) {
      await prisma.recentlyViewed.update({
        where: { id: existing.id },
        data: { viewedAt: new Date(), userId: user?.id ?? undefined },
      });
    } else {
      const count = await prisma.recentlyViewed.count({ where: { sessionId: guest } });
      if (count >= 20) {
        const oldest = await prisma.recentlyViewed.findMany({
          where: { sessionId: guest },
          orderBy: { viewedAt: "asc" },
          take: count - 19,
          select: { id: true },
        });
        await prisma.recentlyViewed.deleteMany({
          where: { id: { in: oldest.map((o) => o.id) } },
        });
      }
      await prisma.recentlyViewed.create({
        data: { sessionId: guest, userId: user?.id ?? null, productId: body.productId },
      });
    }
  } catch {
    // tracking must never break the page
  }

  return jsonOk({ tracked: true });
});

export const GET = withApi(async () => {
  const user = await getSessionUser();
  const store = await cookies();
  const guest = store.get("imalissa_guest")?.value;

  const rows = await prisma.recentlyViewed.findMany({
    where: user ? { OR: [{ userId: user.id }, { sessionId: guest ?? "" }] } : { sessionId: guest ?? "" },
    orderBy: { viewedAt: "desc" },
    take: 12,
    include: {
      product: {
        include: {
          images: { orderBy: { position: "asc" }, take: 1 },
          brand: { select: { name: true } },
          category: { select: { name: true, slug: true } },
        },
      },
    },
  });

  const items = rows
    .filter((r) => r.product && r.product.status === "ACTIVE")
    .map((r) => toProductCard(r.product));

  return jsonOk(items);
});
