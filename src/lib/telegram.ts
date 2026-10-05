import path from "node:path";
import fs from "node:fs/promises";
import { prisma } from "./db";
import { getSettings } from "./settings";
import { formatBDT } from "./utils";

/**
 * Real Telegram Bot API alerts (https://core.telegram.org/bots/api).
 *
 * Secret handling: the bot token lives ONLY in .env (TELEGRAM_BOT_TOKEN).
 * It is never stored in the database, never returned by an API and never
 * printed to logs — every outbound request goes straight to api.telegram.org
 * and error text is passed through as-is (the API never echoes the token).
 *
 * Admin configuration lives in Admin → Settings → Telegram: the message
 * title and the destination Chat ID. Nothing else.
 */

const TG_API = "https://api.telegram.org";
/** Never send more than this many product photos per order. */
const MAX_PHOTOS = 8;
const RASTER_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".avif"]);

export type TelegramSettings = { title: string; chatId: string };

function botToken(): string {
  return (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
}

/** Configured = a token in .env AND a chat id from the admin settings. */
export function telegramReady(chatId: string): boolean {
  return botToken().length > 10 && chatId.trim().length > 0;
}

/** Escape user-controlled text for Telegram's HTML parse mode. */
function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function call(method: string, form: FormData): Promise<void> {
  const token = botToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set in .env");
  const res = await fetch(`${TG_API}/bot${token}/${method}`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => null)) as
    | { ok?: boolean; description?: string }
    | null;
  if (!res.ok || !body?.ok) {
    throw new Error(`Telegram ${method} failed: ${body?.description ?? res.statusText}`);
  }
}

/** Send a formatted text message. Throws on failure (caller decides). */
export async function sendTelegramText(chatId: string, text: string): Promise<void> {
  const form = new FormData();
  form.set("chat_id", chatId.trim());
  form.set("text", text.slice(0, 4000));
  form.set("parse_mode", "HTML");
  await call("sendMessage", form);
}

/**
 * Copy bytes into a standalone ArrayBuffer — a BlobPart TypeScript accepts
 * for sure (Uint8Array<ArrayBufferLike> does not type-check as one).
 */
function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(data.byteLength);
  new Uint8Array(ab).set(data);
  return ab;
}

/** Upload a photo (as bytes — works for local and CDN images alike). */
export async function sendTelegramPhoto(
  chatId: string,
  photo: { data: Uint8Array; filename: string },
  caption: string
): Promise<void> {
  const form = new FormData();
  form.set("chat_id", chatId.trim());
  form.set("photo", new Blob([toArrayBuffer(photo.data)], { type: "image/jpeg" }), photo.filename);
  form.set("caption", caption.slice(0, 1000));
  form.set("parse_mode", "HTML");
  await call("sendPhoto", form);
}

/* ── Image → JPEG (Telegram needs a raster photo; our SVGs are not) ── */

function safeFilename(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 60) || "image";
}

async function loadPhoto(src: string): Promise<{ data: Uint8Array; filename: string } | null> {
  try {
    let bytes: Buffer;
    let name: string;

    if (/^https?:\/\//i.test(src)) {
      const res = await fetch(src, { signal: AbortSignal.timeout(12_000) });
      if (!res.ok) return null;
      bytes = Buffer.from(await res.arrayBuffer());
      name = src.split("?")[0].split("/").pop() || "image";
    } else {
      const rel = src.replace(/^\/+/, "");
      if (rel.includes("..")) return null; // no path traversal
      const abs = path.join(process.cwd(), "public", rel);
      bytes = await fs.readFile(abs);
      name = path.basename(abs);
    }

    const ext = path.extname(name).toLowerCase();
    try {
      const mod = await import("sharp");
      const sharp = mod.default ?? mod;
      const jpeg = await sharp(Buffer.from(bytes), ext === ".svg" ? { density: 150 } : undefined)
        .resize({ width: 900, withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 82 })
        .toBuffer();
      return { data: jpeg, filename: `${safeFilename(name.replace(/\.[^.]+$/, ""))}.jpg` };
    } catch {
      // sharp unavailable/failed — only a genuine raster file is usable.
      if (RASTER_EXT.has(ext)) return { data: bytes, filename: safeFilename(name) };
      return null;
    }
  } catch {
    return null; // missing file / unreachable URL → photo skipped, text still sent
  }
}

/* ── Order alert ─────────────────────────────────────────────────── */

type OrderWithItems = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;

async function loadOrder(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { orderBy: { id: "asc" } } },
  });
}

function orderText(order: OrderWithItems, title: string): string {
  const a = (order.address ?? {}) as Record<string, string | null>;
  const str = (v?: string | null) => (v && String(v).trim() ? String(v).trim() : "");
  const lines: string[] = [];

  if (title.trim()) lines.push(`<b>${esc(title.trim())}</b>`);
  lines.push(`🛒 <b>New order</b> — <b>${esc(order.orderNumber)}</b>`);
  lines.push(
    `🕓 ${order.placedAt.toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Dhaka",
    })} (BST)`
  );
  lines.push("");
  lines.push("<b>Customer</b>");
  lines.push(`Name: ${esc(order.customerName)}`);
  lines.push(`Phone: ${esc(order.customerPhone)}`);
  if (order.customerEmail || str(a.email)) lines.push(`Email: ${esc(order.customerEmail || a.email)}`);
  lines.push("");
  lines.push("<b>Delivery address</b>");
  lines.push(esc(str(a.fullAddress)));
  const area = [str(a.area), str(a.district)].filter(Boolean).join(", ");
  if (area) lines.push(esc(area));
  if (a.division) lines.push(esc(a.division));
  if (str(order.instructions)) lines.push(`Instructions: ${esc(order.instructions)}`);
  lines.push("");
  lines.push(`<b>Items (${order.items.length})</b>`);
  order.items.forEach((it, i) => {
    lines.push(
      `${i + 1}. ${esc(it.productName)}${it.variantLabel ? ` (${esc(it.variantLabel)})` : ""} × ${it.quantity} — <b>${formatBDT(Number(it.lineTotal))}</b>`
    );
  });
  lines.push("");
  lines.push("<b>Payment</b>");
  lines.push(`Method: ${esc(order.paymentMethod)} · Status: ${esc(order.paymentStatus)}`);
  lines.push(`Subtotal: ${formatBDT(Number(order.subtotal))}`);
  if (Number(order.discount) > 0) {
    lines.push(`Discount${order.couponCode ? ` (${esc(order.couponCode)})` : ""}: -${formatBDT(Number(order.discount))}`);
  }
  lines.push(`Delivery: ${formatBDT(Number(order.deliveryCharge))}`);
  lines.push(`<b>Total: ${formatBDT(Number(order.total))}</b>`);
  if (str(order.customerNote)) lines.push("");
  if (str(order.customerNote)) lines.push(`Customer note: ${esc(order.customerNote)}`);

  const site = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  if (site) {
    lines.push("");
    lines.push(`🔗 Admin: <a href="${esc(site)}/admin/orders/${esc(order.id)}">open order</a>`);
  }
  return lines.join("\n");
}

/**
 * Fire the "order placed" alert: one text message with the full checkout
 * details, then a photo per line item (best effort — a photo that cannot be
 * converted is skipped, the text message already carries the whole order).
 *
 * Never throws and never touches the order: checkout succeeds regardless of
 * what Telegram does. Failures are logged so they are visible, not hidden.
 */
export async function notifyNewOrderOnTelegram(orderId: string): Promise<void> {
  try {
    if (botToken().length <= 10) {
      console.warn("[telegram] order alert NOT sent: TELEGRAM_BOT_TOKEN is not set in .env");
      return;
    }
    const settings = await getSettings();
    const tg: TelegramSettings = settings.telegram;
    const chatId = (tg.chatId ?? "").trim();
    if (!chatId) {
      console.warn(
        "[telegram] order alert NOT sent: no Chat ID — set it in Admin → Settings → Telegram"
      );
      return;
    }

    const order = await loadOrder(orderId);
    if (!order) return;

    await sendTelegramText(chatId, orderText(order, tg.title ?? ""));

    const items = order.items.slice(0, MAX_PHOTOS);
    for (const [i, item] of items.entries()) {
      if (!item.image) continue;
      const photo = await loadPhoto(item.image);
      if (!photo) continue;
      try {
        await sendTelegramPhoto(
          chatId,
          photo,
          `${i + 1}. <b>${esc(item.productName)}</b> × ${item.quantity} — <b>${formatBDT(Number(item.lineTotal))}</b>`
        );
      } catch (err) {
        console.warn(
          `[telegram] photo skipped for ${order.orderNumber}:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    console.log(`[telegram] order alert sent: ${order.orderNumber} (${order.items.length} items)`);
  } catch (err) {
    console.error(
      "[telegram] order alert failed:",
      err instanceof Error ? err.message : err
    );
  }
}
