import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withApi, jsonOk, parseBody, rateLimit, clientIp } from "@/lib/api";
import {
  cartAddSchema,
  cartUpdateSchema,
  addToCart,
  updateCartItem,
  removeCartItem,
  priceCart,
  findCart,
} from "@/lib/cart";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { cookieSecure } from "@/lib/utils";

/**
 * Cart API.
 *  GET    → current cart summary
 *  POST   → add item { productId, variantId?, color?, size?, quantity }
 *  PATCH  → update quantity { itemId, quantity }
 *  DELETE → remove ?itemId= (or clear all when no itemId)
 *
 * Guests are identified by an httpOnly guest cookie, so their cart
 * survives reloads and return visits.
 */

async function guestId(): Promise<string | null> {
  const store = await cookies();
  return store.get("imalissa_guest")?.value ?? null;
}

async function ensureGuestId(req: NextRequest): Promise<string> {
  const store = await cookies();
  const existing = store.get("imalissa_guest")?.value;
  if (existing) return existing;
  const id = randomBytes(16).toString("hex");
  store.set("imalissa_guest", id, {
    httpOnly: true,
    sameSite: "lax",
    // Must follow the real protocol (SITE_URL), not NODE_ENV: over LAN HTTP
    // a Secure cookie is silently dropped and the guest cart vanishes.
    secure: cookieSecure(),
    path: "/",
    maxAge: 60 * 60 * 24 * 180, // 180 days
  });
  return id;
}

export const GET = withApi(async () => {
  const user = await getSessionUser();
  const guest = await guestId();
  const cart = await findCart(user?.id ?? null, guest);
  if (!cart) {
    return jsonOk({ items: [], subtotal: 0, savings: 0, itemCount: 0, couponCode: null });
  }
  return jsonOk(await priceCart(cart.id));
});

export const POST = withApi(async (req: NextRequest) => {
  rateLimit(`cart-add:${clientIp(req)}`, 60, 60_000);
  const body = parseBody(cartAddSchema, await req.json().catch(() => ({})));
  const user = await getSessionUser();
  const gid = await ensureGuestId(req);
  const summary = await addToCart(user?.id ?? null, gid, body);
  return jsonOk(summary);
});

export const PATCH = withApi(async (req: NextRequest) => {
  const body = parseBody(cartUpdateSchema, await req.json().catch(() => ({})));
  const user = await getSessionUser();
  const gid = await guestId();
  const summary = await updateCartItem(user?.id ?? null, gid, body.itemId, body.quantity);
  return jsonOk(summary);
});

export const DELETE = withApi(async (req: NextRequest) => {
  const user = await getSessionUser();
  const gid = await guestId();
  const itemId = req.nextUrl.searchParams.get("itemId");

  if (itemId) {
    const summary = await removeCartItem(user?.id ?? null, gid, itemId);
    return jsonOk(summary);
  }

  // Clear entire cart.
  const cart = await findCart(user?.id ?? null, gid);
  if (cart) {
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await prisma.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
    return jsonOk(await priceCart(cart.id));
  }
  return jsonOk({ items: [], subtotal: 0, savings: 0, itemCount: 0, couponCode: null });
});
