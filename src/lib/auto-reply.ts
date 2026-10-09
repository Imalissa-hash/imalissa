import { promises as fsp } from "node:fs";
import path from "node:path";
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
 *      A message with a photo goes through Gemini VISION: the model names
 *      the product, the catalog is searched with those keywords, and the
 *      answer is composed from the REAL row (name, price, stock) — the AI
 *      never prices anything itself.
 *   2. No key, or the call fails/times out (8 s) → the deterministic rule
 *      engine answers from the same real data. We never fake an AI.
 *
 * Replies follow the customer's language (Bangla/Banglish → Bangla) and
 * carry no trailing signature — the widget already labels every automatic
 * bubble "Auto reply", so honesty lives in the UI, not in the text.
 */

const AI_TIMEOUT_MS = 8_000;

export type AutoReplyInput = { userId: string; text: string; imageUrl?: string | null };
export type AutoReplyResult = { text: string; imageUrl?: string | null };

export async function generateAutoReply(input: AutoReplyInput): Promise<AutoReplyResult | null> {
  const key = process.env.GEMINI_API_KEY?.trim();

  // A photo goes through the vision flow — the rules engine has no eyes.
  if (input.imageUrl) {
    if (key) {
      try {
        const photo = await identifyPhoto(key, input);
        if (photo) return photo;
      } catch {
        // fall through to the honest "couldn't identify" answer below
      }
    }
    return { text: photoUnknownReply(input.text) };
  }

  if (key) {
    try {
      const ai = await askGemini(key, input);
      if (ai) return { text: ai };
    } catch {
      // fall through to the rules — an AI hiccup must never block the chat
    }
  }
  const rules = await ruleReply(input);
  return rules ? { text: rules } : null;
}

/** Chat photos may only live under /uploads/chat with a known extension. */
const CHAT_IMAGE_RE = /^\/uploads\/chat\/([A-Za-z0-9._-]+\.(?:jpg|png|webp))$/;
const chatImageKey = (imageUrl: string) => CHAT_IMAGE_RE.exec(imageUrl)?.[1] ?? null;

const mimeOf = (file: string) =>
  file.endsWith(".png")
    ? "image/png"
    : file.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";

/** True when the customer wrote in English (empty/photo-only → Bangla). */
function isEnglish(text: string): boolean {
  if (!text.trim()) return false;
  return !/[\u0980-\u09FF]/.test(text) && !/\b(ki|kemon|dorkar|koto|ache|ase|na|hy|tumi|apni|bhai|dada|vai)\b/i.test(text);
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

Style: 2-4 short sentences, warm and practical, plain text.
LANGUAGE: if the customer writes in Bangla script or Banglish (Romanized Bangla), reply entirely in Bangla — most Imalissa customers are Bangladeshi and may not read English. Only reply in English when the customer's message is in English. Never bury a Bangla-speaking customer in English text.
If the facts do not cover the question (specific product stock, an order not listed, complaints, anything sensitive), say our team will reply here personally soon and help with it.
Do NOT add any footer, disclaimer or signature line — just the answer.`;

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

/* ─────────────────── photo → product (Gemini vision) ────────────────── */

/** Load a customer's chat photo: disk first, then the durable DB copy. */
async function loadChatImage(imageUrl: string): Promise<{ data: string; mime: string } | null> {
  const file = chatImageKey(imageUrl);
  if (!file) return null;

  const onDisk = await fsp
    .readFile(path.join(process.cwd(), "public", "uploads", "chat", file))
    .catch(() => null);
  if (onDisk?.length) return { data: onDisk.toString("base64"), mime: mimeOf(file) };

  const row = await prisma.storedImage
    .findUnique({ where: { key: `chat/${file}` } })
    .catch(() => null);
  if (row?.bytes?.length) {
    return { data: Buffer.from(row.bytes).toString("base64"), mime: row.mime || mimeOf(file) };
  }
  return null;
}

type CatalogHit = {
  name: string;
  slug: string;
  price: number;
  compareAtPrice: number | null;
  discountPercent: number;
  stock: number;
  category: string;
  image: string | null;
};

/**
 * Search ACTIVE products by the vision output, best keyword score first.
 *
 * Vision answers with *phrases* ("menstrual heating pad") while real names
 * word them differently ("Portable Menstrual Heating & Vibration Massage
 * Belt"), so a whole-phrase `contains` matches nothing. We therefore match
 * the individual words too and score each candidate by how many distinct
 * requested words its name carries (a full phrase counts double). Only a
 * score ≥ 2 is reported — a single generic word ("pad" in "Padlock") is
 * never enough to quote a price, and no match honestly says so.
 */
async function matchCatalog(keywords: string[], productName = ""): Promise<CatalogHit[]> {
  const phrases = [...keywords, productName]
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length >= 3)
    .slice(0, 10);
  if (!phrases.length) return [];

  const words = [
    ...new Set(
      phrases.flatMap((p) => p.split(/[^a-z0-9]+/)).filter((w) => w.length >= 3)
    ),
  ];
  if (!words.length) return [];

  const rows = await prisma.product.findMany({
    where: {
      status: "ACTIVE",
      OR: words.map((w) => ({ name: { contains: w } })),
    },
    take: 40,
    select: {
      name: true,
      slug: true,
      price: true,
      compareAtPrice: true,
      discountPercent: true,
      stock: true,
      category: { select: { name: true } },
      images: {
        orderBy: { position: "asc" },
        take: 1,
        select: { url: true },
      },
    },
  });

  const scored = rows
    .map((p) => {
      const hay = p.name.toLowerCase();
      // distinct requested words present in the name, +2 per full phrase
      const wordsHit = words.filter((w) => hay.includes(w)).length;
      const phraseHit = phrases.filter((ph) => hay.includes(ph)).length * 2;
      return {
        name: p.name,
        slug: p.slug,
        price: Number(p.price),
        compareAtPrice: p.compareAtPrice === null ? null : Number(p.compareAtPrice),
        discountPercent: p.discountPercent,
        stock: p.stock,
        category: p.category.name,
        image: p.images[0]?.url ?? null,
        score: wordsHit + phraseHit,
      };
    })
    .filter((p) => p.score >= 2)
    .sort((a, b) => b.score - a.score || b.stock - a.stock);

  return scored.slice(0, 3);
}

/**
 * Photo flow: Gemini VISION reads the customer's photo and returns short
 * search keywords as JSON. The catalog is then searched with those
 * keywords and the answer is composed from the REAL product rows — the AI
 * never names a price, a stock level or a policy on its own. The matched
 * product's photo comes back too, so the customer sees it in the chat and
 * can download it from the site.
 */
async function identifyPhoto(key: string, input: AutoReplyInput): Promise<AutoReplyResult | null> {
  if (!input.imageUrl) return null;
  const img = await loadChatImage(input.imageUrl);
  if (!img) return null;

  const english = isEnglish(input.text);
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";

  const system = `You identify product photos for Imalissa, an online store in Bangladesh.
Look at the image and answer with ONLY a JSON object:
{"product": "short product name in English", "keywords": ["3-8 lowercase English search words for the product type, brand, color and distinguishing features"]}
Keywords must be words a shop would use in a product NAME (e.g. "saree silk pink", "earbuds wireless", "tshirt polo cotton"). If the image shows no real product, answer {"product":"", "keywords":[]}.`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
  let keywords: string[] = [];
  let productName = "";
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [
          {
            role: "user",
            parts: [
              { inline_data: { mime_type: img.mime, data: img.data } },
              { text: input.text.trim() || "Identify this product." },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: 512,
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.warn(`[auto-reply] gemini vision HTTP ${res.status} — photo unidentified`);
      return null;
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const out = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const parsed = JSON.parse(out.trim()) as { product?: string; keywords?: string[] };
    productName = (parsed.product ?? "").trim().slice(0, 120);
    keywords = Array.isArray(parsed.keywords) ? parsed.keywords : [];
  } catch (err) {
    console.warn(
      `[auto-reply] gemini vision failed (${err instanceof Error ? err.name : "?"}) — photo unidentified`
    );
    return null;
  } finally {
    clearTimeout(timer);
  }

  const hits = await matchCatalog(keywords, productName);
  if (!hits.length) {
    // Honest answer: the photo was seen but nothing in our catalog matched.
    return {
      text: english
        ? `Thanks for the photo! I could see ${productName ? productName : "the product"}, but I couldn't find it in Imalissa's catalog. Send me the product name or a link instead — our team will also reply here personally soon.`
        : `ছবির জন্য ধন্যবাদ! ${productName ? productName : "পণ্যটি"} আমি দেখতে পেছিলাম, কিন্তু আমাদের Imalissa ক্যাটালগে মিল পাওয়া যায়নি। পণ্যের নাম বা লিংক পাঠান — আমাদের টিম এখানেই উত্তর দেবে।`,
    };
  }

  const top = hits[0];
  const money = (n: number) => `৳${Math.round(n).toLocaleString("en-US")}`;
  const lines: string[] = [];

  if (english) {
    lines.push(`I found it in our catalog: ${top.name} (${top.category}).`);
    lines.push(`Price: ${money(top.price)}${top.discountPercent > 0 ? ` — ${top.discountPercent}% off${top.compareAtPrice ? `, was ${money(top.compareAtPrice)}` : ""}` : ""}.`);
    lines.push(
      top.stock > 0
        ? `In stock — ${top.stock} pcs available right now.`
        : `Out of stock at the moment; our team can tell you when it returns.`
    );
    if (hits[1]) lines.push(`Also similar: ${hits[1].name} — ${money(hits[1].price)}.`);
    lines.push(`Details: ${top.slug ? `/product/${top.slug}` : "ask us here"}`);
  } else {
    lines.push(`ছবি থেকে খুঁজে পেয়েছি: ${top.name} (${top.category})।`);
    lines.push(`দাম: ${money(top.price)}${top.discountPercent > 0 ? ` — ${top.discountPercent}% ছাড়${top.compareAtPrice ? ` (আগে ${money(top.compareAtPrice)})` : ""}` : ""}।`);
    lines.push(
      top.stock > 0
        ? `স্টকে আছে — এখন ${top.stock} টি পাওয়া যাচ্ছে।`
        : `এই মুহূর্তে স্টক নেই; কবে আসবে টিম জানিয়ে দেবে।`
    );
    if (hits[1]) lines.push(`এরকম আরেকটি: ${hits[1].name} — ${money(hits[1].price)}।`);
    lines.push(`বিস্তারিত: ${top.slug ? `/product/${top.slug}` : "এখানেই জিজ্ঞেস করুন"}`);
  }

  return { text: lines.join("\n"), imageUrl: top.image };
}

/** Honest fallback when the photo cannot be read or matched — never fake. */
function photoUnknownReply(text: string): string {
  return isEnglish(text)
    ? "Sorry, I couldn't identify a product in that photo. Send me the product name or a link instead — our team will also reply here personally soon."
    : "দুঃখিত, ছবিটি দেখে কোনো পণ্য চিনতে পারিনি। পণ্যের নাম বা লিংক পাঠান — আমাদের টিম এখানেই উত্তর দেবে।";
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
      return `আপনার সাম্প্রতিক অর্ডার:\n${lines.join("\n")}\n\nMy Account → Orders-এও দেখতে পারেন, অথবা এখানেই আরও জানতে চাইলে জিজ্ঞেস করুন।`;
    }
    return `দুঃখিত, আপনার অ্যাকাউন্টে এখনো কোনো অর্ডার পাওয়া যায়নি। লগইন না করে অর্ডার করে থাকলে অর্ডার নম্বর বা ফোন নম্বর এখানে দিন — আমাদের টিম খুঁজে দেখবে।`;
  }

  /* 2. delivery — live checkout settings */
  if (has("delivery", "deliver", "shipping", "charge", "কতদিন", "ডেলিভারি", "শিপিং")) {
    const s = await getSettings();
    const f = {
      dhaka: s.checkout.deliveryCharges["Dhaka"] ?? s.checkout.deliveryChargeDefault,
      other: s.checkout.deliveryChargeDefault,
      free: s.checkout.freeDeliveryMin,
    };
    const lines = [`• ঢাকা জেলা: ৳${f.dhaka}`, `• অন্যান্য জেলা: ৳${f.other}`];
    if (f.free > 0) lines.push(`• ৳${f.free}+ অর্ডারে ফ্রি ডেলিভারি`);
    return `সারা বাংলাদেশে হোম ডেলিভারি 🚚\n${lines.join("\n")}\n\nআপনার ঠিকানার সঠিক চার্জ ও ডেলিভারি সময় চেকআউটে দেখা যাবে।`;
  }

  /* 3. payment — methods actually enabled in the store */
  if (has("payment", "pay", "cod", "bkash", "nagad", "card", "cash", "পেমেন্ট")) {
    const methods = await availablePaymentMethods().catch(() => []);
    if (methods.length) {
      const names = methods.map((m) => m.label).join(", ");
      const cod = methods.some((m) => m.method === "COD");
      const tail = cod
        ? "Cash on Delivery মানে অর্ডার হাতে পেয়ে টাকা দিতে পারবেন।"
        : "চেকআউটে আপনার পছন্দের পেমেন্ট অপশন বেছে নিন।";
      return `আপনি যেসব পেমেন্ট পদ্ধতিতে পে করতে পারেন: ${names}।\n\n${tail}`;
    }
    return `পেমেন্ট অপশনগুলো কী, আমাদের টিম এখানেই শীঘ্রই জানিয়ে দেবে।`;
  }

  /* 4. returns — the store's own policy text when present */
  if (has("return", "refund", "exchange", "রিটার্ন", "ফেরত")) {
    const s = await getSettings();
    const item = (s.trust ?? []).find((t) => /return|refund/i.test(`${t.title} ${t.text}`));
    const lead = item
      ? `${item.title} — ${item.text}`
      : "রিটার্ন/ফেরত নীতি সম্পর্কে আমাদের টিম আপনার অর্ডার অনুযায়ী নিশ্চিত করবে।";
    return `${lead}\n\nপ্রক্রিয়া শুরু করতে অর্ডার নম্বর এখানে দিন।`;
  }

  /* 5. stock / size — needs the specific product */
  if (has("stock", "available", "size", "স্টক")) {
    return `প্রোডাক্টের লিংক বা নাম এখানে দিন — স্টক ও সাইজের খবর সঙ্গে সঙ্গে জানিয়ে দেব।`;
  }

  /* 6. greeting / thanks */
  if (
    /(^|\s)(hi|hey|hello|salam|assalam|thanks|thank|dhonnobad)\b/.test(q) ||
    q.includes("সালাম") ||
    q.includes("ধন্যবাদ")
  ) {
    return `হ্যালো! 👋 Imalissa-তে স্বাগতম। প্রোডাক্ট, ডেলিভারি, পেমেন্ট বা অর্ডার সম্পর্কে যা খুশি জিজ্ঞেস করুন — আমাদের টিম এখানেই উত্তর দেবে।`;
  }

  /* 7. fallback */
  return `Imalissa-কে মেসেজ করার জন্য ধন্যবাদ! 🌟 এটি সঙ্গে সঙ্গের অটো রিপ্লাই — একজন টিম সদস্য আপনার মেসেজটি পড়ে এখানেই উত্তর দেবেন।\n\nযা যা জিজ্ঞেস করতে পারেন: অর্ডার স্ট্যাটাস · ডেলিভারি চার্জ · পেমেন্ট পদ্ধতি · রিটার্ন।`;
}
