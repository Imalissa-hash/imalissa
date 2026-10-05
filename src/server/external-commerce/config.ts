/**
 * External commerce configuration.
 *
 * All secrets live ONLY in server environment variables (.env) — never
 * NEXT_PUBLIC_*, never in the database, never sent to the browser, and
 * never written into sync logs (requests/responses are sanitized).
 */

import type { ExternalMode } from "./types";

export interface ExternalCommerceConfig {
  mode: ExternalMode;
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
  timeoutMs: number;
}

const VALID_MODES: ExternalMode[] = ["disabled", "mock", "live"];

export function getConfig(): ExternalCommerceConfig {
  const rawMode = (process.env.EXTERNAL_COMMERCE_MODE || "disabled").toLowerCase().trim();
  const mode: ExternalMode = (VALID_MODES as string[]).includes(rawMode)
    ? (rawMode as ExternalMode)
    : "disabled";

  const timeout = Number(process.env.EXTERNAL_COMMERCE_TIMEOUT_MS || 15000);

  return {
    mode,
    baseUrl: (process.env.EXTERNAL_COMMERCE_BASE_URL || "").trim().replace(/\/+$/, ""),
    apiKey: process.env.EXTERNAL_COMMERCE_API_KEY || "",
    apiSecret: process.env.EXTERNAL_COMMERCE_API_SECRET || "",
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? Math.min(timeout, 60_000) : 15_000,
  };
}

/** True when live credentials/base URL are present (adapter may run). */
export function hasLiveCredentials(cfg: ExternalCommerceConfig = getConfig()): boolean {
  return cfg.mode === "live" && cfg.baseUrl.length > 0;
}

const SECRET_KEY_PATTERN = /(secret|password|passwd|token|api[-_]?key|authorization|signature|credential)/i;

/**
 * Recursively redact anything that looks like a secret before persisting a
 * request/response snapshot to ApiSyncLog or ExternalOrderMapping.
 */
export function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[depth-limit]";
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") {
    // Also scrub anything that looks like a long bearer token/secret.
    if (value.length > 500) return `${value.slice(0, 500)}…[truncated]`;
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_PATTERN.test(k) ? "[REDACTED]" : sanitize(v, depth + 1);
    }
    return out;
  }
  return String(value);
}
