import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class names safely. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number as Bangladeshi Taka, e.g. ৳1,250 */
export function formatBDT(amount: number | string | { toString(): string }, withSymbol = true): string {
  const n = Number(amount);
  if (Number.isNaN(n)) return withSymbol ? "৳0" : "0";
  const formatted = n.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return withSymbol ? `৳${formatted}` : formatted;
}

/** Round money to 2 decimals (avoids float drift in totals). */
export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** URL-safe slug from a string. */
export function slugify(input: string): string {
  return input
    .toString()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

/** Unique-ish slug suffix helper: product-2, product-3 … */
export function appendSuffix(slug: string, suffix: number): string {
  return `${slug}-${suffix}`;
}

/** Days/hours from now helpers */
export function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

export function formatDate(date: Date | string | null | undefined, style: "long" | "short" | "time" = "long"): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  if (style === "time") return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  if (style === "short") return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
  return d.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/** Discounted price after percent off. */
export function salePrice(price: number, discountPercent: number): number {
  if (!discountPercent || discountPercent <= 0) return price;
  return roundMoney(price * (1 - Math.min(discountPercent, 100) / 100));
}

/** Compute discount % from compare-at pricing. */
export function discountPercentOf(price: number, compareAt?: number | null): number {
  if (!compareAt || compareAt <= price) return 0;
  return Math.round(((compareAt - price) / compareAt) * 100);
}

/** Absolute URL for the site (SEO/sitemaps/OG). */
export function absoluteUrl(path = "/"): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Whether cookies should carry the `Secure` flag: only when the site is
 * actually served over HTTPS. Gating on NODE_ENV===production broke guest
 * carts/logins on plain-HTTP deployments (localhost, LAN IP) because
 * browsers silently drop Secure cookies over http://192.168.x.x.
 */
export function cookieSecure(): boolean {
  return absoluteUrl("/").startsWith("https://");
}

export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Join a variant into a readable label, e.g. "Black / L" */
export function variantLabel(color?: string | null, size?: string | null): string | null {
  const parts = [color, size].filter(Boolean) as string[];
  return parts.length ? parts.join(" / ") : null;
}

/** Truncate plain text for meta descriptions. */
export function truncate(text: string, max = 155): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

/** Clamp helper */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/** Wait (ms) — used by mock provider to simulate network latency. */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
