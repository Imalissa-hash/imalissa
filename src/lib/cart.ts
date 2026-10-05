import { z } from "zod";
import { prisma } from "./db";
import { roundMoney, salePrice } from "./utils";
import { ApiError, badRequest, notFound, tooMany } from "./errors";
import { getSettings } from "./settings";

/**
 * Cart logic.
 *
 * Carts are tied either to a logged-in user OR to an anonymous session id
 * (a random cookie issued by the client), so guests keep their cart when
 * they come back. Prices are ALWAYS re-computed server-side — the client
 * never sends money values.
 */

export const CART_COOKIE = "imalissa_cart";

export const cartAddSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().nullish(),
  color: z.string().max(60).nullish(),
  size: z.string().max(60).nullish(),
  quantity: z.number().int().min(1).max(99).default(1),
});

export const cartUpdateSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().int().min(0).max(99),
});

export interface PricedCartItem {
  id: string;
  productId: string;
  variantId: string | null;
  name: string;
  slug: string;
  image: string | null;
  sku: string;
  color: string | null;
  size: string | null;
  variantLabel: string | null;
  unitPrice: number;
  compareAtPrice: number | null;
  quantity: number;
  lineTotal: number;
  stockAvailable: number;
  inStock: boolean;
  maxQuantity: number;
}

export interface CartSummary {
  items: PricedCartItem[];
  subtotal: number;
  savings: number;
  itemCount: number;
  couponCode: string | null;
}

/** Resolve cart by user (preferred) or guest session id. */
export async function findCart(userId?: string | null, guestId?: string | null) {
  if (userId) {
    return prisma.cart.findUnique({ where: { userId }, include: { items: true } });
  }
  if (guestId) {
    return prisma.cart.findUnique({ where: { sessionId: guestId }, include: { items: true } });
  }
  return null;
}

/** Find or create the caller's cart. */
export async function ensureCart(userId?: string | null, guestId?: string | null) {
  const existing = await findCart(userId, guestId);
  if (existing) {
    // If the user logged in later, attach the guest cart to their account.
    if (userId && !existing.userId) {
      return prisma.cart.update({
        where: { id: existing.id },
        data: { userId },
        include: { items: true },
      });
    }
    return existing;
  }
  return prisma.cart.create({
    data: {
      userId: userId ?? undefined,
      sessionId: userId ? undefined : guestId ?? undefined,
    },
    include: { items: true },
  });
}

/** Price the cart from current catalog data (source of truth). */
export async function priceCart(cartId: string): Promise<CartSummary> {
  const cart = await prisma.cart.findUnique({
    where: { id: cartId },
    include: {
      items: {
        include: { product: { include: { images: { orderBy: { position: "asc" } } } }, variant: true },
        orderBy: { addedAt: "asc" },
      },
    },
  });

  if (!cart) return { items: [], subtotal: 0, savings: 0, itemCount: 0, couponCode: null };

  const items: PricedCartItem[] = [];
  let subtotal = 0;
  let savings = 0;
  let itemCount = 0;

  for (const item of cart.items) {
    const product = item.product;
    if (!product || product.status !== "ACTIVE") continue; // skip removed/draft products

    const basePrice = Number(product.price);
    const unitPrice = item.variant?.price != null ? Number(item.variant.price) : basePrice;
    const effectiveDiscount =
      item.variant?.price != null ? 0 : Math.min(product.discountPercent || 0, 100);
    const regularPrice = item.variant?.price != null ? basePrice : Number(product.compareAtPrice ?? basePrice);
    const listForSavings =
      item.variant?.price != null
        ? Math.max(regularPrice, unitPrice)
        : Number(product.compareAtPrice ?? unitPrice);

    const stockForVariant = item.variant ? item.variant.stock : product.stock;
    const lineTotal = roundMoney(unitPrice * item.quantity);

    subtotal += lineTotal;
    itemCount += item.quantity;
    if (listForSavings > unitPrice) {
      savings += roundMoney((listForSavings - unitPrice) * item.quantity);
    }

    items.push({
      id: item.id,
      productId: product.id,
      variantId: item.variantId,
      name: product.name,
      slug: product.slug,
      image: product.images[0]?.url ?? null,
      sku: item.variant?.sku ?? product.sku,
      color: item.color,
      size: item.size,
      variantLabel: [item.color, item.size].filter(Boolean).join(" / ") || null,
      unitPrice,
      compareAtPrice: listForSavings > unitPrice ? listForSavings : null,
      quantity: item.quantity,
      lineTotal,
      stockAvailable: stockForVariant,
      inStock: stockForVariant > 0,
      maxQuantity: Math.max(0, Math.min(stockForVariant, 99)),
    });
  }

  return {
    items,
    subtotal: roundMoney(subtotal),
    savings: roundMoney(savings),
    itemCount,
    couponCode: cart.couponCode,
  };
}

/** Add a product (with optional variant) to the cart. */
export async function addToCart(
  userId: string | null,
  guestId: string | null,
  input: z.infer<typeof cartAddSchema>
): Promise<CartSummary> {
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    include: { variants: true },
  });
  if (!product || product.status !== "ACTIVE") throw notFound("Product not found");

  let variantId: string | null = null;
  let variantStock = product.stock;

  if (product.variants.length > 0) {
    // A variant selection is required when the product has variants.
    const match = product.variants.find(
      (v) =>
        (input.color ? v.color === input.color : true) &&
        (input.size ? v.size === input.size : true)
    );
    const exact = input.color || input.size
      ? product.variants.find(
          (v) =>
            (input.color ? v.color === input.color : !v.color) &&
            (input.size ? v.size === input.size : !v.size)
        )
      : undefined;

    const chosen = exact ?? match;
    if (!chosen) throw badRequest("Please select an available option");
    if (!input.color && !input.size) {
      throw badRequest("Please select a color/size option");
    }
    variantId = chosen.id;
    variantStock = chosen.stock;
  }

  if (variantStock <= 0) throw badRequest("This item is out of stock");

  const cart = await ensureCart(userId, guestId);

  // Increment if the exact same line exists, otherwise create one.
  const existing = await prisma.cartItem.findFirst({
    where: {
      cartId: cart.id,
      productId: input.productId,
      variantId,
    },
  });

  const desired = (existing?.quantity ?? 0) + input.quantity;
  if (desired > variantStock) {
    throw badRequest(`Only ${variantStock} left in stock`);
  }

  if (existing) {
    await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: desired } });
  } else {
    await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        productId: input.productId,
        variantId,
        color: input.color ?? null,
        size: input.size ?? null,
        quantity: input.quantity,
      },
    });
  }

  await prisma.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });
  return priceCart(cart.id);
}

/** Change quantity (0 removes the line). */
export async function updateCartItem(
  userId: string | null,
  guestId: string | null,
  itemId: string,
  quantity: number
): Promise<CartSummary> {
  const cart = await findCart(userId, guestId);
  if (!cart) throw notFound("Cart not found");

  const item = await prisma.cartItem.findFirst({
    where: { id: itemId, cartId: cart.id },
    include: { variant: true, product: true },
  });
  if (!item) throw notFound("Item not found in cart");

  if (quantity === 0) {
    await prisma.cartItem.delete({ where: { id: item.id } });
    return priceCart(cart.id);
  }

  const stockAvailable = item.variant ? item.variant.stock : item.product.stock;
  if (quantity > stockAvailable) throw badRequest(`Only ${stockAvailable} left in stock`);

  await prisma.cartItem.update({ where: { id: item.id }, data: { quantity } });
  return priceCart(cart.id);
}

export async function removeCartItem(
  userId: string | null,
  guestId: string | null,
  itemId: string
): Promise<CartSummary> {
  const cart = await findCart(userId, guestId);
  if (!cart) throw notFound("Cart not found");
  await prisma.cartItem.deleteMany({ where: { id: itemId, cartId: cart.id } });
  return priceCart(cart.id);
}

/** Move a cart line to the wishlist (auth users only). */
export async function moveToWishlist(
  userId: string,
  itemId: string
): Promise<CartSummary> {
  const cart = await findCart(userId, null);
  if (!cart) throw notFound("Cart not found");

  const item = await prisma.cartItem.findFirst({
    where: { id: itemId, cartId: cart.id },
  });
  if (!item) throw notFound("Item not found in cart");

  await prisma.$transaction([
    prisma.wishlist.upsert({
      where: { userId_productId: { userId, productId: item.productId } },
      update: {},
      create: { userId, productId: item.productId },
    }),
    prisma.cartItem.delete({ where: { id: item.id } }),
  ]);

  return priceCart(cart.id);
}

/** Apply or clear a coupon code on the cart (validated at checkout too). */
export async function applyCoupon(
  userId: string | null,
  guestId: string | null,
  code: string | null
): Promise<CartSummary> {
  const cart = await findCart(userId, guestId);
  if (!cart) throw notFound("Cart not found");

  if (!code) {
    await prisma.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
    return priceCart(cart.id);
  }

  const summary = await priceCart(cart.id);
  const { validateCoupon } = await import("./coupon");
  await validateCoupon(code.trim().toUpperCase(), summary.subtotal, userId);
  await prisma.cart.update({
    where: { id: cart.id },
    data: { couponCode: code.trim().toUpperCase() },
  });
  return priceCart(cart.id);
}

/** Merge a guest cart into the user cart after login. */
export async function mergeCarts(userId: string, guestId: string | null): Promise<void> {
  if (!guestId) return;
  const [userCart, guestCart] = await Promise.all([
    prisma.cart.findUnique({ where: { userId }, include: { items: true } }),
    prisma.cart.findUnique({ where: { sessionId: guestId }, include: { items: true } }),
  ]);
  if (!guestCart) return;

  if (!userCart) {
    await prisma.cart.update({ where: { id: guestCart.id }, data: { userId, sessionId: null } });
    return;
  }

  for (const item of guestCart.items) {
    const existing = await prisma.cartItem.findFirst({
      where: { cartId: userCart.id, productId: item.productId, variantId: item.variantId },
    });
    if (existing) {
      await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: Math.min(existing.quantity + item.quantity, 99) },
      });
    } else {
      await prisma.cartItem.update({ where: { id: item.id }, data: { cartId: userCart.id } });
    }
  }

  await prisma.cart.delete({ where: { id: guestCart.id } }).catch(() => undefined);
}
