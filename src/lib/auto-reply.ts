import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { availablePaymentMethods } from "@/server/payment";

/**
 * Instant auto reply for the customer support chat — HYBRID:
 *
 *   1. GEMINI_API_KEY set   → a REAL Gemini call answers, grounded strictly
 *      in the facts loaded below (live settings, enabled payment methods,
 *      the customer's own orders). Key lives in .env.local / Render env,
 *      is read server-side only, and never appears in output or logs.
 *   2. No key, or the call fails/times out (8 s) → the deterministic rule
 *      engine answers from the same real data. We never fake an AI.
 *
 * Every reply ends with an honest note stating it is automatic.
 */

const RULES_NOTE = "_(Instant auto reply — our team will reply here personally soon.)_";
const AI_NOTE = "_(Auto reply by Imalissa AI — our team will reply here personally soon.)_";

const AI_TIMEOUT_MS = 8_000;

export type AutoReplyInput = { userId: string; text: string };

export async function generateAutoReply(input: AutoReplyInput): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (key) {
    try {
      const ai = await askGemini(key, input);
      if (ai) return ai;
    } catch {
      // fall through to the rules — an AI hiccup must never block the chat
    }
  }
  return ruleReply(input);
}

/* ───────────────────────── real-data context ───────────────────────── */

type Facts = {
  dhaka: number;
  other: number;
  free: number;
  payments: string;
  returnPolicy: string;
  orders: string;
};

async function loadFacts(userId: string): Promise<Facts> {
  const [settings, methods, orders] = await Promise.all([
    getSettings(),
    availablePaymentMethods().catch(() => []),
    prisma.order.findMany({
      where: { userId },
      orderBy: { placedAt: "desc" },
      take: 3,
      select: { orderNumber: true, status: true, placedAt: true },
    }),
  ]);

  const returnItem = (settings.trust ?? []).find((t) =>
    /return|refund/i.test(`${t.title} ${t.text}`)
  );

  return {
    dhaka: settings.checkout.deliveryCharges["Dhaka"] ?? settings.checkout.deliveryChargeDefault,
    other: settings.checkout.deliveryChargeDefault,
    free: settings.checkout.freeDeliveryMin,
    payments: methods.length
      ? methods.map((m) => m.label).join(", ")
      : "shown at checkout",
    returnPolicy: returnItem
      ? `${returnItem.title} — ${returnItem.text}`
      : "no fixed policy text configured; the team will confirm for each order",
    orders: orders.length
      ? orders
          .map(
            (o) =>
              `- ${o.orderNumber}: status ${o.status.replace(/_/g, " ")}, placed ${o.placedAt.toLocaleDateString(
                "en-GB",
                { day: "numeric", month: "short" }
              )}`
          )
          .join("\n")
      : "No orders on this account.",
  };
}

/* ───────────────────────────── Gemini ──────────────────────────────── */

async function askGemini(key: string, { userId, text }: AutoReplyInput): Promise<string | null> {
  // gemini-flash-latest / 3.8-flash ride the hottest (often overloaded)
  // release; the lite line has been the stable, fast responder for this key.
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
  const f = await loadFacts(userId);

  const system = `You are the instant chat assistant of Imalissa, a real online store in Bangladesh.
Answer the customer's message using ONLY these verified facts — never invent products, prices, policies, timelines or discounts:

- Delivery: Dhaka district ৳${f.dhaka}; other districts ৳${f.other}; free delivery on orders of ৳${f.free}+. The exact charge and ETA for the customer's address appear at checkout.
- Payment methods enabled in this store: ${f.payments}.
- Return policy as configured by the store: ${f.returnPolicy}.
- This customer's recent orders:\n${f.orders}

Style: 2-4 short sentences, warm and practical, plain text. If the customer writes in Bangla script or Banglish, reply in the same style.
If the facts do not cover the question (specific product stock, an order not listed, complaints, anything sensitive), say our team will reply here personally soon and help with it.
ALWAYS end with this exact line on its own: ${AI_NOTE}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS); // total budget, both attempts
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const init = {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: { maxOutputTokens: 1024, temperature: 0.4 },
      }),
      signal: ctrl.signal,
    };

    // One retry for Google's transient answers (overloaded / rate) — a
    // single blip must not silently downgrade every chat to the rules.
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await fetch(url, init);
      if (res.ok) {
        const data = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
        };
        const cand = data.candidates?.[0];
        const out = cand?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
        const trimmed = out.trim();
        if (trimmed.length < 10) {
          // thinking models can burn maxOutputTokens on reasoning → empty answer
          console.warn(
            `[auto-reply] gemini empty answer (finish=${cand?.finishReason ?? "?"}) — using rules`
          );
          return null;
        }
        return trimmed.slice(0, 2000);
      }

      const retriable = res.status === 429 || res.status === 502 || res.status === 503;
      if (retriable && attempt === 1) {
        console.warn(`[auto-reply] gemini HTTP ${res.status} — retrying once`);
        await new Promise((r) => setTimeout(r, 1200)); // abort timer keeps running
        continue;
      }
      console.warn(`[auto-reply] gemini HTTP ${res.status} (attempt ${attempt}) — using rules`);
      return null;
    }
    return null;
  } catch (err) {
    console.warn(
      `[auto-reply] gemini failed (${err instanceof Error ? err.name : "?"}) — using rules`
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ─────────────────────── rules fallback (no key) ───────────────────── */

async function ruleReply({ userId, text }: AutoReplyInput): Promise<string | null> {
  const q = text.toLowerCase();
  const has = (...keys: string[]) => keys.some((k) => q.includes(k));

  /* 1. order status — the customer's REAL orders */
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
      return `Your latest orders:\n${lines.join("\n")}\n\nYou can also see them under My Account → Orders, or ask here for more detail.\n\n${RULES_NOTE}`;
    }
    return `We couldn't find any orders on your account yet. If you ordered without logging in, share your order number or phone number here and our team will look it up.\n\n${RULES_NOTE}`;
  }

  /* 2. delivery — live checkout settings */
  if (has("delivery", "deliver", "shipping", "charge", "কতদিন", "ডেলিভারি", "শিপিং")) {
    const s = await getSettings();
    const f = {
      dhaka: s.checkout.deliveryCharges["Dhaka"] ?? s.checkout.deliveryChargeDefault,
      other: s.checkout.deliveryChargeDefault,
      free: s.checkout.freeDeliveryMin,
    };
    const lines = [`• Dhaka district: ৳${f.dhaka}`, `• Other districts: ৳${f.other}`];
    if (f.free > 0) lines.push(`• Free delivery on orders of ৳${f.free}+`);
    return `Home delivery across Bangladesh 🚚\n${lines.join("\n")}\n\nThe exact charge and estimated delivery time for your address appear at checkout.\n\n${RULES_NOTE}`;
  }

  /* 3. payment — methods actually enabled in the store */
  if (has("payment", "pay", "cod", "bkash", "nagad", "card", "cash", "পেমেন্ট")) {
    const methods = await availablePaymentMethods().catch(() => []);
    if (methods.length) {
      const names = methods.map((m) => m.label).join(", ");
      const cod = methods.some((m) => m.method === "COD");
      const tail = cod
        ? "Cash on Delivery lets you pay when your order arrives."
        : "Choose what works for you at checkout.";
      return `You can pay with: ${names}.\n\n${tail}\n\n${RULES_NOTE}`;
    }
    return `Our team will confirm the available payment options for your order here shortly.\n\n${RULES_NOTE}`;
  }

  /* 4. returns — the store's own policy text when present */
  if (has("return", "refund", "exchange", "রিটার্ন", "ফেরত")) {
    const s = await getSettings();
    const item = (s.trust ?? []).find((t) => /return|refund/i.test(`${t.title} ${t.text}`));
    const lead = item
      ? `${item.title} — ${item.text}.`
      : "Our team will confirm the return/refund policy for your order.";
    return `${lead}\n\nShare your order number here and we'll start the process for you.\n\n${RULES_NOTE}`;
  }

  /* 5. stock / size — needs the specific product */
  if (has("stock", "available", "size", "স্টক")) {
    return `Share the product link or name here and we'll confirm stock and size availability right away.\n\n${RULES_NOTE}`;
  }

  /* 6. greeting / thanks */
  if (
    /(^|\s)(hi|hey|hello|salam|assalam|thanks|thank|dhonnobad)\b/.test(q) ||
    q.includes("সালাম") ||
    q.includes("ধন্যবাদ")
  ) {
    return `Hello! 👋 Welcome to Imalissa. Ask us anything about products, delivery, payment or your order — our team replies here.\n\n${RULES_NOTE}`;
  }

  /* 7. fallback */
  return `Thanks for messaging Imalissa! 🌟 This is an instant auto reply — a team member will read your message and reply here shortly.\n\nYou can ask about: order status · delivery charge · payment methods · returns.\n\n${RULES_NOTE}`;
}
