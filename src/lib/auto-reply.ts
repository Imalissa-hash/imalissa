import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { availablePaymentMethods } from "@/server/payment";

/**
 * Instant auto reply for the customer support chat.
 *
 * HYBRID DESIGN (auto now, AI later):
 *   This is the "auto" half — deterministic rules answered from REAL data
 *   only (the customer's own orders, the live checkout settings, the
 *   payment methods actually enabled). Nothing here simulates an AI.
 *
 *   AI SEAM: when a real provider key arrives (e.g. AI_PROVIDER=gemini +
 *   AI_API_KEY), call it at the top of generateAutoReply() and keep
 *   ruleReply() as its fallback on error — no key ever leaves the server,
 *   and until a key exists this function never pretends to be one.
 *
 * Every reply ends with NOTE so customers always know it's automatic.
 */

const NOTE = "_(Instant auto reply — our team will reply here personally soon.)_";

export type AutoReplyInput = { userId: string; text: string };

export async function generateAutoReply(input: AutoReplyInput): Promise<string | null> {
  // AI seam (see docblock): a configured provider would run first.
  return ruleReply(input);
}

async function ruleReply({ userId, text }: AutoReplyInput): Promise<string | null> {
  const q = text.toLowerCase();
  const has = (...keys: string[]) => keys.some((k) => q.includes(k));

  /* ── 1. order status — the customer's REAL orders ────────────────── */
  if (has("order", "track", "status", "অর্ডার", "ট্র্যাক", "কোথায় গেছে")) {
    const orders = await prisma.order.findMany({
      where: { userId },
      orderBy: { placedAt: "desc" },
      take: 3,
      select: { orderNumber: true, status: true, placedAt: true },
    });
    if (orders.length) {
      const lines = orders.map(
        (o) =>
          `• ${o.orderNumber} — ${o.status.replace(/_/g, " ")} (${o.placedAt.toLocaleDateString(
            "en-GB",
            { day: "numeric", month: "short" }
          )})`
      );
      return `Your latest orders:\n${lines.join("\n")}\n\nYou can also see them under My Account → Orders, or ask here for more detail.\n\n${NOTE}`;
    }
    return `We couldn't find any orders on your account yet. If you ordered without logging in, share your order number or phone number here and our team will look it up.\n\n${NOTE}`;
  }

  /* ── 2. delivery — live checkout settings ────────────────────────── */
  if (has("delivery", "deliver", "shipping", "charge", "কতদিন", "ডেলিভারি", "শিপিং")) {
    const s = await getSettings();
    const dhaka = s.checkout.deliveryCharges["Dhaka"] ?? s.checkout.deliveryChargeDefault;
    const other = s.checkout.deliveryChargeDefault;
    const free = s.checkout.freeDeliveryMin;
    const lines = [`• Dhaka district: ৳${dhaka}`, `• Other districts: ৳${other}`];
    if (free > 0) lines.push(`• Free delivery on orders of ৳${free}+`);
    return `Home delivery across Bangladesh 🚚\n${lines.join("\n")}\n\nThe exact charge and estimated delivery time for your address appear at checkout.\n\n${NOTE}`;
  }

  /* ── 3. payment — methods actually enabled in the store ──────────── */
  if (has("payment", "pay", "cod", "bkash", "nagad", "card", "cash", "পেমেন্ট")) {
    const methods = await availablePaymentMethods();
    if (methods.length) {
      const names = methods.map((m) => m.label).join(", ");
      const cod = methods.some((m) => m.method === "COD");
      const tail = cod
        ? "Cash on Delivery lets you pay when your order arrives."
        : "Choose what works for you at checkout.";
      return `You can pay with: ${names}.\n\n${tail}\n\n${NOTE}`;
    }
    return `Our team will confirm the available payment options for your order here shortly.\n\n${NOTE}`;
  }

  /* ── 4. returns — quote the store's own policy text when present ─── */
  if (has("return", "refund", "exchange", "রিটার্ন", "ফেরত")) {
    const s = await getSettings();
    const item = (s.trust ?? []).find((t) =>
      /return|refund/i.test(`${t.title} ${t.text}`)
    );
    const policy = item ? `${item.title} — ${item.text}.` : null;
    const lead =
      policy ??
      "Our team will confirm the return/refund policy for your order.";
    return `${lead}\n\nShare your order number here and we'll start the process for you.\n\n${NOTE}`;
  }

  /* ── 5. stock / size — needs the specific product ────────────────── */
  if (has("stock", "available", "size", "স্টক")) {
    return `Share the product link or name here and we'll confirm stock and size availability right away.\n\n${NOTE}`;
  }

  /* ── 6. greeting / thanks ────────────────────────────────────────── */
  if (
    /(^|\s)(hi|hey|hello|salam|assalam|thanks|thank|dhonnobad)\b/.test(q) ||
    q.includes("সালাম") ||
    q.includes("ধন্যবাদ")
  ) {
    return `Hello! 👋 Welcome to Imalissa. Ask us anything about products, delivery, payment or your order — our team replies here.\n\n${NOTE}`;
  }

  /* ── 7. fallback ─────────────────────────────────────────────────── */
  return `Thanks for messaging Imalissa! 🌟 This is an instant auto reply — a team member will read your message and reply here shortly.\n\nYou can ask about: order status · delivery charge · payment methods · returns.\n\n${NOTE}`;
}
