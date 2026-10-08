import { NextRequest } from "next/server";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { withApi, jsonOk, parseBody, rateLimit, clientIp } from "@/lib/api";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { badRequest } from "@/lib/errors";
import { getExternalProvider, resetExternalProvider } from "@/server/external-commerce/index";

export const dynamic = "force-dynamic";

/**
 * GET/POST /api/admin/external-api — the partner API connection (base URL,
 * mode, credentials) edited from /admin/settings → "External API" tab.
 *
 * Why this is a separate endpoint from /api/admin/settings:
 *  - that endpoint refuses every payload key matching
 *    /key|secret|token|password|credential/ **by design** (settings are
 *    display-only config), and
 *  - a dashboard must never receive a secret back.
 *
 * So credentials are written to the server `.env` file — the same place
 * `SMTP_PASS` already lives — and this API only ever answers with booleans
 * (`hasApiKey` / `hasApiSecret`). Values are write-only: they go in, they
 * never come out.
 *
 * Saving also patches `process.env` in this process, so `getConfig()`
 * (src/server/external-commerce/config.ts) picks the new connection up
 * immediately — no server restart.
 */

const ENV_PATH = path.join(process.cwd(), ".env");

const VAR = {
  mode: "EXTERNAL_COMMERCE_MODE",
  baseUrl: "EXTERNAL_COMMERCE_BASE_URL",
  apiKey: "EXTERNAL_COMMERCE_API_KEY",
  apiSecret: "EXTERNAL_COMMERCE_API_SECRET",
} as const;

const MODES = ["disabled", "mock", "live"] as const;

/** Quotes + control chars would break (or inject into) the .env file. */
const UNSAFE_ENV = /[\u0000-\u001f\u007f"]/;

/* ── .env read/write ──────────────────────────────────────────────── */

async function readEnvFile(): Promise<string> {
  return fsp.readFile(ENV_PATH, "utf8").catch(() => "");
}

function unquote(raw: string): string {
  let v = raw.trim();
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1);
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1);
  const comment = v.indexOf(" #");
  if (comment >= 0) v = v.slice(0, comment);
  return v.trim();
}

function parseEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const m = /^\s*([\w.-]+)\s*=\s*(.*)$/.exec(line);
    if (m) out[m[1]] = unquote(m[2]);
  }
  return out;
}

/** Replace `key="value"` in place, or append it — every other line is kept verbatim. */
function setVar(content: string, key: string, value: string): string {
  const lines = content.split(/\r?\n/);
  const idx = lines.findIndex((line) => /^\s*([\w.-]+)\s*=/.exec(line)?.[1] === key);
  const line = `${key}="${value}"`;
  if (idx >= 0) {
    lines[idx] = line;
  } else {
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    if (lines.length) lines.push("");
    lines.push(line);
  }
  return lines.join("\n") + "\n";
}

/** Effective values: live process.env first, `.env` file as fallback. */
async function readStatus() {
  const file = parseEnv(await readEnvFile());
  const pick = (key: string) => process.env[key] ?? file[key] ?? "";
  const mode = pick(VAR.mode).toLowerCase().trim();
  return {
    mode: (MODES as readonly string[]).includes(mode) ? mode : "disabled",
    baseUrl: pick(VAR.baseUrl).trim().replace(/\/+$/, ""),
    hasApiKey: pick(VAR.apiKey).trim().length > 0,
    hasApiSecret: pick(VAR.apiSecret).trim().length > 0,
  };
}

/* ── Validation ───────────────────────────────────────────────────── */

const bodySchema = z.object({
  /**
   * `action: "test"` runs a live health check (GET /me) against the SAVED
   * connection and returns { ok, message, latencyMs } — no credentials.
   * Omitted = save the fields below.
   */
  action: z.enum(["save", "test"]).optional(),
  mode: z.enum(MODES).optional(),
  baseUrl: z.string().max(300, "Base URL is too long").optional(),
  /** Omitted = leave unchanged; empty string = remove the credential. */
  apiKey: z.string().max(300, "API key is too long").optional(),
  apiSecret: z.string().max(300, "API secret is too long").optional(),
});

function normalizeBaseUrl(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (/\s/.test(v)) throw badRequest("Base URL cannot contain spaces");
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    throw badRequest("Base URL must be a full URL, e.g. https://partner.example.com/api");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw badRequest("Base URL must start with http:// or https://");
  }
  if (url.username || url.password) {
    throw badRequest("Base URL must not embed a username/password — use the API key field");
  }
  return v.replace(/\/+$/, "");
}

function normalizeSecret(value: string, label: string): string {
  const v = value.trim();
  if (v && UNSAFE_ENV.test(v)) {
    throw badRequest(`${label} cannot contain quotes, line breaks or tab characters`);
  }
  return v;
}

/* ── Handlers ─────────────────────────────────────────────────────── */

/** GET /api/admin/external-api — connection status (never the credential values). */
export const GET = withApi(async () => {
  await requirePermission("settings.view");
  return jsonOk(await readStatus());
});

/**
 * POST /api/admin/external-api
 * Body: { mode?, baseUrl?, apiKey?, apiSecret? } — omitted fields are left
 * untouched, an empty apiKey/apiSecret clears it.
 */
export const POST = withApi(async (req: NextRequest) => {
  const admin = await requirePermission("settings.manage");
  rateLimit(`admin-external-api:${clientIp(req)}`, 20, 60_000);

  const raw = await req.json().catch(() => null);
  if (raw === null || typeof raw !== "object") throw badRequest("Invalid JSON body");
  const body = parseBody(bodySchema, raw);

  // ── Live connection test (GET /me) against what is saved right now ──
  if (body.action === "test") {
    resetExternalProvider(); // drop any provider built with older credentials
    const health = await getExternalProvider().healthCheck();
    return jsonOk({ test: health });
  }

  const baseUrl = body.baseUrl === undefined ? null : normalizeBaseUrl(body.baseUrl);
  const apiKey = body.apiKey === undefined ? null : normalizeSecret(body.apiKey, "API key");
  const apiSecret = body.apiSecret === undefined ? null : normalizeSecret(body.apiSecret, "API secret");
  const mode = body.mode ?? null;

  // Validate the RESULTING connection, not just this request's fragment:
  // switching to live without a URL (or setting a URL while disabled) is a
  // misconfiguration the admin should see before saving.
  const current = await readStatus();
  const effectiveMode = mode ?? current.mode;
  const effectiveBaseUrl = baseUrl === null ? current.baseUrl : baseUrl;
  if (effectiveMode === "live" && !effectiveBaseUrl) {
    throw badRequest('Base URL is required when mode is "live"');
  }
  if (effectiveBaseUrl && effectiveMode === "disabled") {
    throw badRequest('Mode is "disabled" — pick mock or live to use the Base URL');
  }

  let content = await readEnvFile();
  const apply = (key: string, value: string | null) => {
    if (value === null) return;
    content = setVar(content, key, value);
    process.env[key] = value; // effective immediately, no restart
  };

  apply(VAR.mode, mode);
  apply(VAR.baseUrl, baseUrl);
  apply(VAR.apiKey, apiKey);
  apply(VAR.apiSecret, apiSecret);

  if (mode !== null || baseUrl !== null || apiKey !== null || apiSecret !== null) {
    try {
      await fsp.writeFile(ENV_PATH, content, "utf8");
    } catch (err) {
      throw badRequest(
        `Could not write .env — connection not saved (${err instanceof Error ? err.message : "unknown error"})`
      );
    }
    // process.env was patched above — rebuild the cached provider so the new
    // connection is used by the very next checkout/sync (still no restart).
    resetExternalProvider();
  }

  await audit({
    adminId: admin.id,
    action: "SETTINGS_UPDATE",
    entityType: "ExternalCommerce",
    entityId: "connection",
    details: {
      // Never the credential values — only what changed.
      mode: mode ?? undefined,
      baseUrl: baseUrl ?? undefined,
      apiKeySet: apiKey === null ? undefined : apiKey.length > 0,
      apiSecretSet: apiSecret === null ? undefined : apiSecret.length > 0,
    },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk(await readStatus());
});
