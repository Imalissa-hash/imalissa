"use client";

import { useEffect, useRef, useState } from "react";
import { Info, KeyRound, Plus, Trash2, Upload } from "lucide-react";
import type { SettingsShape } from "@/lib/settings";
import {
  Panel,
  Field,
  TextInput,
  TextArea,
  Select,
  Checkbox,
  BusyBtn,
  Tabs,
  Btn,
} from "@/components/admin/ui";
import { cn } from "@/lib/utils";

/**
 * Site settings editor — one tab per SettingsShape group, each tab saves
 * its whole group via PATCH /api/admin/settings { group, value }.
 */

type Group = keyof SettingsShape;

interface TabDef {
  key: string;
  label: string;
  group: Group;
}

const TABS: TabDef[] = [
  { key: "general", label: "General", group: "announcement" },
  { key: "brand", label: "Brand", group: "brand" },
  { key: "contact", label: "Contact", group: "contact" },
  { key: "seo", label: "SEO", group: "seo" },
  { key: "checkout", label: "Checkout", group: "checkout" },
  { key: "trust", label: "Trust", group: "trust" },
  { key: "footer", label: "Footer", group: "footer" },
  { key: "external", label: "External API", group: "externalApi" },
  { key: "telegram", label: "Telegram", group: "telegram" },
];

/**
 * Hardcoded copy of BD_DIVISIONS' 8 division names — src/lib/delivery.ts
 * imports prisma and must never be bundled into a client component.
 */
const DIVISIONS = [
  "Dhaka",
  "Chattogram",
  "Rajshahi",
  "Khulna",
  "Barishal",
  "Sylhet",
  "Rangpur",
  "Mymensingh",
] as const;

const TRUST_ICONS = [
  { value: "shield", label: "Shield — authenticity" },
  { value: "wallet", label: "Wallet — payment" },
  { value: "truck", label: "Truck — delivery" },
  { value: "refresh", label: "Refresh — returns" },
] as const;

const MIN_TRUST = 1;
const MAX_TRUST = 8;

type SaveStatus = { state: "idle" | "saving" | "saved" | "error"; message?: string };

export function SettingsClient({ initial }: { initial: SettingsShape }) {
  const [values, setValues] = useState<SettingsShape>(initial);
  const [tab, setTab] = useState<string>(TABS[0].key);
  const [status, setStatus] = useState<Record<string, SaveStatus>>({});

  const active = TABS.find((t) => t.key === tab) ?? TABS[0];
  const st = status[active.group] ?? { state: "idle" };

  const patch = <K extends Group>(group: K, next: SettingsShape[K]) => {
    setValues((prev) => ({ ...prev, [group]: next }) as SettingsShape);
  };

  const save = async () => {
    const group = active.group;
    setStatus((s) => ({ ...s, [group]: { state: "saving" } }));
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group, value: values[group] }),
      });
      const json = await res.json().catch(() => ({ ok: false, message: "Unexpected server response" }));
      if (json.ok) {
        setStatus((s) => ({ ...s, [group]: { state: "saved", message: "Saved" } }));
        window.setTimeout(() => {
          setStatus((s) =>
            s[group]?.state === "saved" ? { ...s, [group]: { state: "idle" } } : s
          );
        }, 2500);
      } else {
        setStatus((s) => ({
          ...s,
          [group]: { state: "error", message: json.message ?? "Save failed — changes not applied" },
        }));
      }
    } catch {
      setStatus((s) => ({
        ...s,
        [group]: { state: "error", message: "Network error — changes not saved" },
      }));
    }
  };

  return (
    <div className="space-y-5">
      <Tabs tabs={TABS.map((t) => ({ key: t.key, label: t.label }))} active={tab} onChange={setTab} />

      <Panel title={active.label}>
        <div className="min-h-[240px]">
          {tab === "general" && (
            <GeneralFields value={values.announcement} onChange={(v) => patch("announcement", v)} />
          )}
          {tab === "contact" && (
            <ContactFields value={values.contact} onChange={(v) => patch("contact", v)} />
          )}
          {tab === "brand" && <BrandFields value={values.brand} onChange={(v) => patch("brand", v)} />}
          {tab === "seo" && <SeoFields value={values.seo} onChange={(v) => patch("seo", v)} />}
          {tab === "checkout" && (
            <CheckoutFields value={values.checkout} onChange={(v) => patch("checkout", v)} />
          )}
          {tab === "trust" && (
            <TrustFields value={values.trust} onChange={(v) => patch("trust", v)} />
          )}
          {tab === "footer" && (
            <FooterFields value={values.footer} onChange={(v) => patch("footer", v)} />
          )}
          {tab === "external" && (
            <>
              <ExternalApiConnection />
              <div className="mt-5 border-t border-white/[0.07] pt-5">
                <ExternalApiFields
                  value={values.externalApi}
                  onChange={(v) => patch("externalApi", v)}
                />
              </div>
            </>
          )}
          {tab === "telegram" && (
            <TelegramFields value={values.telegram} onChange={(v) => patch("telegram", v)} />
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-4">
          <p
            className={cn(
              "text-[0.8rem]",
              st.state === "saved" && "text-success",
              st.state === "error" && "text-danger",
              st.state === "saving" && "text-mist-500",
              st.state === "idle" && "text-mist-600"
            )}
            role="status"
            aria-live="polite"
          >
            {st.state === "saving" && "Saving…"}
            {st.state === "saved" && "✓ Saved"}
            {st.state === "error" && (st.message ?? "Save failed")}
            {st.state === "idle" && "Changes apply to the storefront after saving."}
          </p>
          <BusyBtn busy={st.state === "saving"} onClick={save}>
            Save {active.label}
          </BusyBtn>
        </div>
      </Panel>
    </div>
  );
}

/* ── Brand (site logo) ────────────────────────────────────────────── */

function BrandFields({
  value,
  onChange,
}: {
  value: SettingsShape["brand"];
  onChange: (v: SettingsShape["brand"]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File | null | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/upload?dir=settings", { method: "POST", body: fd });
      const json = await res
        .json()
        .catch(() => ({ ok: false, message: "Unexpected server response" }));
      if (json.ok && json.data?.url) {
        onChange({ ...value, logo: String(json.data.url) });
      } else {
        setError(json.message ?? "Upload failed — the logo was not set");
      }
    } catch {
      setError("Network error — upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Field
        label="Site logo"
        hint="Shown beside the site name in the website header, footer and the admin sidebar. When empty, the built-in gold monogram is used. JPEG / PNG / WebP / GIF / SVG, up to 4MB."
      >
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gold-500/30 bg-white/[0.05]">
            {value.logo ? (
              <img
                src={value.logo}
                alt="Site logo preview"
                className="h-full w-full object-contain p-1.5"
              />
            ) : (
              <span className="text-[0.6rem] uppercase tracking-wider text-mist-600">None</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Btn variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload size={14} /> {busy ? "Uploading…" : value.logo ? "Replace logo" : "Upload logo"}
            </Btn>
            <Btn
              variant="danger"
              onClick={() => onChange({ ...value, logo: "" })}
              disabled={busy || !value.logo}
            >
              <Trash2 size={14} /> Remove
            </Btn>
          </div>
        </div>
        {error && <p className="mt-2 text-[0.76rem] text-danger">{error}</p>}
      </Field>

      <Field
        label="Logo path"
        hint="Uploads are stored in /uploads/settings — you can also paste any image URL here. Press “Save Brand” to apply."
      >
        <TextInput
          value={value.logo}
          maxLength={300}
          onChange={(e) => onChange({ ...value, logo: e.target.value })}
          placeholder="/uploads/settings/logo.png"
        />
      </Field>
    </div>
  );
}

/* ── General (announcement) ───────────────────────────────────────── */

function GeneralFields({
  value,
  onChange,
}: {
  value: SettingsShape["announcement"];
  onChange: (v: SettingsShape["announcement"]) => void;
}) {
  return (
    <div className="space-y-4">
      <Checkbox
        label="Show the announcement bar"
        checked={value.enabled}
        onChange={(v) => onChange({ ...value, enabled: v })}
      />
      <Field label="Announcement text" hint="Shown in the top bar of every page">
        <TextInput
          value={value.text}
          maxLength={500}
          onChange={(e) => onChange({ ...value, text: e.target.value })}
          placeholder="Free delivery on orders over ৳3,000"
        />
      </Field>
      <Field label="Announcement link" hint="Relative path (e.g. /search) or full URL — leave empty for no link">
        <TextInput
          value={value.link}
          maxLength={300}
          onChange={(e) => onChange({ ...value, link: e.target.value })}
          placeholder="/search"
        />
      </Field>
    </div>
  );
}

/* ── Contact ──────────────────────────────────────────────────────── */

function ContactFields({
  value,
  onChange,
}: {
  value: SettingsShape["contact"];
  onChange: (v: SettingsShape["contact"]) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Phone">
        <TextInput value={value.phone} onChange={(e) => onChange({ ...value, phone: e.target.value })} />
      </Field>
      <Field label="Support email">
        <TextInput value={value.email} onChange={(e) => onChange({ ...value, email: e.target.value })} />
      </Field>
      <Field label="Address" className="sm:col-span-2">
        <TextInput value={value.address} onChange={(e) => onChange({ ...value, address: e.target.value })} />
      </Field>
      <Field label="Business hours">
        <TextInput value={value.hours} onChange={(e) => onChange({ ...value, hours: e.target.value })} />
      </Field>
      <Field label="Facebook URL">
        <TextInput value={value.facebook} onChange={(e) => onChange({ ...value, facebook: e.target.value })} />
      </Field>
      <Field label="Instagram URL">
        <TextInput value={value.instagram} onChange={(e) => onChange({ ...value, instagram: e.target.value })} />
      </Field>
      <Field label="YouTube URL">
        <TextInput value={value.youtube} onChange={(e) => onChange({ ...value, youtube: e.target.value })} />
      </Field>
    </div>
  );
}

/* ── SEO ──────────────────────────────────────────────────────────── */

function SeoFields({
  value,
  onChange,
}: {
  value: SettingsShape["seo"];
  onChange: (v: SettingsShape["seo"]) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Default page title" hint="Used when a page doesn't define its own">
          <TextInput value={value.defaultTitle} onChange={(e) => onChange({ ...value, defaultTitle: e.target.value })} />
        </Field>
        <Field label="Title template" hint="%s is replaced by the page title">
          <TextInput value={value.titleTemplate} onChange={(e) => onChange({ ...value, titleTemplate: e.target.value })} />
        </Field>
      </div>
      <Field label="Default description" hint="Shown in search results — keep it under ~160 characters">
        <TextArea rows={3} value={value.defaultDescription} onChange={(e) => onChange({ ...value, defaultDescription: e.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Keywords" hint="Comma-separated meta keywords">
          <TextInput value={value.keywords} onChange={(e) => onChange({ ...value, keywords: e.target.value })} />
        </Field>
        <Field label="Open Graph image path" hint="e.g. /images/og-default.jpg">
          <TextInput value={value.ogImage} onChange={(e) => onChange({ ...value, ogImage: e.target.value })} />
        </Field>
      </div>
      <Field label="Robots directive" hint='e.g. "index, follow" — use "noindex, nofollow" to hide the site from search engines'>
        <TextInput value={value.robots} onChange={(e) => onChange({ ...value, robots: e.target.value })} />
      </Field>
    </div>
  );
}

/* ── Checkout ─────────────────────────────────────────────────────── */

function CheckoutFields({
  value,
  onChange,
}: {
  value: SettingsShape["checkout"];
  onChange: (v: SettingsShape["checkout"]) => void;
}) {
  const num = (s: string) => {
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Default delivery charge (৳)" hint="Used for any district with no specific charge (৳130 outside Dhaka)">
          <TextInput
            type="number"
            min={0}
            value={value.deliveryChargeDefault}
            onChange={(e) => onChange({ ...value, deliveryChargeDefault: num(e.target.value) })}
          />
        </Field>
        <Field label="Free delivery minimum order (৳)" hint="Orders at or above this subtotal deliver free — 0 disables it">
          <TextInput
            type="number"
            min={0}
            value={value.freeDeliveryMin}
            onChange={(e) => onChange({ ...value, freeDeliveryMin: num(e.target.value) })}
          />
        </Field>
      </div>

      <div>
        <p className="mb-2 text-[0.78rem] font-semibold text-mist-300">Delivery charge by district (jela) (৳) — Dhaka district ৳80, all other districts use the default above</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {DIVISIONS.map((d) => (
            <Field key={d} label={d}>
              <TextInput
                type="number"
                min={0}
                value={value.deliveryCharges[d] ?? 0}
                onChange={(e) =>
                  onChange({
                    ...value,
                    deliveryCharges: { ...value.deliveryCharges, [d]: num(e.target.value) },
                  })
                }
              />
            </Field>
          ))}
        </div>
        <p className="mt-1.5 text-[0.74rem] text-mist-600">
          Each entry is matched against the delivery district (jela) selected at checkout. Districts
          without a specific charge fall back to the default charge above.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
        <p className="text-[0.78rem] font-semibold text-mist-300">Payment methods</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Checkbox label="Cash on Delivery (COD)" checked={value.codEnabled} onChange={(v) => onChange({ ...value, codEnabled: v })} />
          <Checkbox label="bKash" checked={value.bkashEnabled} onChange={(v) => onChange({ ...value, bkashEnabled: v })} />
          <Checkbox label="Nagad" checked={value.nagadEnabled} onChange={(v) => onChange({ ...value, nagadEnabled: v })} />
          <Checkbox label="Card (Visa / Mastercard)" checked={value.cardEnabled} onChange={(v) => onChange({ ...value, cardEnabled: v })} />
        </div>
        <p className="flex gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] p-3 text-[0.76rem] leading-relaxed text-amber-200/90">
          <Info size={14} className="mt-0.5 shrink-0" />
          Digital payment switches only take effect when real gateway credentials are configured;
          unavailable methods stay hidden at checkout.
        </p>
      </div>

      <Field label="Checkout instructions" hint="Shown to customers during checkout (payment/delivery notes)">
        <TextArea rows={4} value={value.instructions} onChange={(e) => onChange({ ...value, instructions: e.target.value })} />
      </Field>
    </div>
  );
}

/* ── Trust badges ─────────────────────────────────────────────────── */

function TrustFields({
  value,
  onChange,
}: {
  value: SettingsShape["trust"];
  onChange: (v: SettingsShape["trust"]) => void;
}) {
  const updateRow = (i: number, row: SettingsShape["trust"][number]) =>
    onChange(value.map((r, idx) => (idx === i ? row : r)));

  return (
    <div className="space-y-4">
      <p className="text-[0.8rem] text-mist-500">
        Reassurance badges shown across the storefront. {MIN_TRUST}–{MAX_TRUST} badges.
      </p>

      {value.map((row, i) => (
        <div
          key={i}
          className="grid gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 sm:grid-cols-[1fr_1.4fr_auto_auto] sm:items-end"
        >
          <Field label={`Badge ${i + 1} — title`}>
            <TextInput value={row.title} maxLength={80} onChange={(e) => updateRow(i, { ...row, title: e.target.value })} />
          </Field>
          <Field label="Text">
            <TextInput value={row.text} maxLength={200} onChange={(e) => updateRow(i, { ...row, text: e.target.value })} />
          </Field>
          <Field label="Icon">
            <Select value={row.icon} onChange={(e) => updateRow(i, { ...row, icon: e.target.value })}>
              {TRUST_ICONS.map((ic) => (
                <option key={ic.value} value={ic.value}>
                  {ic.label}
                </option>
              ))}
            </Select>
          </Field>
          <Btn
            variant="danger"
            disabled={value.length <= MIN_TRUST}
            onClick={() => onChange(value.filter((_, idx) => idx !== i))}
            className="mb-0.5"
          >
            <Trash2 size={14} />
          </Btn>
        </div>
      ))}

      <div>
        <Btn variant="outline" disabled={value.length >= MAX_TRUST} onClick={() => onChange([...value, { title: "New badge", text: "", icon: "shield" }])}>
          <Plus size={14} /> Add badge
        </Btn>
        {value.length >= MAX_TRUST && (
          <span className="ml-3 text-[0.74rem] text-mist-600">Maximum {MAX_TRUST} badges.</span>
        )}
      </div>
    </div>
  );
}

/* ── Footer ───────────────────────────────────────────────────────── */

function FooterFields({
  value,
  onChange,
}: {
  value: SettingsShape["footer"];
  onChange: (v: SettingsShape["footer"]) => void;
}) {
  return (
    <div className="space-y-4">
      <Field label="About text" hint="Short store description shown in the footer">
        <TextArea rows={4} value={value.aboutText} onChange={(e) => onChange({ ...value, aboutText: e.target.value })} />
      </Field>
      <Field
        label="Copyright line"
        hint='The {{year}} placeholder is replaced automatically with the current year, e.g. "© {{year}} Imalissa"'
      >
        <TextInput value={value.copyright} onChange={(e) => onChange({ ...value, copyright: e.target.value })} />
      </Field>
    </div>
  );
}

/* ── External API (non-secret display settings) ───────────────────── */

function ExternalApiFields({
  value,
  onChange,
}: {
  value: SettingsShape["externalApi"];
  onChange: (v: SettingsShape["externalApi"]) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="flex gap-2 rounded-xl border border-gold-500/25 bg-gold-500/[0.07] p-3.5 text-[0.8rem] leading-relaxed text-gold-200/90">
        <KeyRound size={15} className="mt-0.5 shrink-0 text-gold-400" />
        Credentials are written to the server <code className="text-gold-300">.env</code> file and are
        never returned to the browser — you can set them in the box above, but a saved key can never
        be read back here.
      </p>
      <Field label="Display name" hint="How the partner API is labelled inside the admin panel">
        <TextInput value={value.displayName} onChange={(e) => onChange({ ...value, displayName: e.target.value })} />
      </Field>
      <Checkbox
        label="Automatically push new orders to the external API"
        checked={value.autoSync}
        onChange={(v) => onChange({ ...value, autoSync: v })}
      />
      <Field label="Notes" hint="Internal notes for the team — not shown to customers">
        <TextArea rows={4} value={value.notes} onChange={(e) => onChange({ ...value, notes: e.target.value })} />
      </Field>
    </div>
  );
}

/* ── External API — connection (URL + credentials) ─────────────────── */

type ApiConnection = { mode: string; baseUrl: string; hasApiKey: boolean; hasApiSecret: boolean };

const MODE_OPTIONS = [
  { value: "disabled", label: "disabled — orders stay local" },
  { value: "mock", label: "mock — simulate the partner (demo)" },
  { value: "live", label: "live — real partner API" },
] as const;

/**
 * Base URL + API credentials, persisted to the server `.env` via
 * POST /api/admin/external-api. The key is write-only: GET returns
 * `hasApiKey` (boolean), never the value, so it cannot leak to the browser.
 */
function ExternalApiConnection() {
  const [conn, setConn] = useState<ApiConnection | null>(null);
  const [mode, setMode] = useState("disabled");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [state, setState] = useState<SaveStatus>({ state: "idle" });

  const apply = (d: ApiConnection) => {
    setConn(d);
    setMode(d.mode);
    setBaseUrl(d.baseUrl);
    setApiKey("");
    setApiSecret("");
  };

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/external-api")
      .then((r) => r.json())
      .then((j) => {
        if (alive && j?.ok) apply(j.data as ApiConnection);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const post = async (payload: Record<string, unknown>, success: string) => {
    setState({ state: "saving" });
    try {
      const res = await fetch("/api/admin/external-api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({ ok: false, message: "Unexpected server response" }));
      if (!json.ok) {
        setState({ state: "error", message: json.message ?? "Connection not saved" });
        return;
      }
      apply(json.data as ApiConnection);
      setState({ state: "saved", message: success });
      window.setTimeout(() => setState((s) => (s.state === "saved" ? { state: "idle" } : s)), 2500);
    } catch {
      setState({ state: "error", message: "Network error — connection not saved" });
    }
  };

  const save = () => {
    const payload: Record<string, unknown> = { mode, baseUrl };
    if (apiKey) payload.apiKey = apiKey;
    if (apiSecret) payload.apiSecret = apiSecret;
    return post(payload, "✓ Connection saved");
  };

  /* Live check against the SAVED connection (GET /me on the partner API). */
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      const res = await fetch("/api/admin/external-api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      const json = (await res.json().catch(() => ({ ok: false }))) as {
        ok?: boolean;
        message?: string;
        data?: { test?: { ok: boolean; message: string; latencyMs?: number } };
      };
      const h = json.data?.test;
      if (!json.ok || !h) setTest({ ok: false, text: json.message ?? "Test failed" });
      else
        setTest({
          ok: h.ok,
          text: `${h.ok ? "✓ " : "✕ "}${h.message}${h.latencyMs ? ` · ${h.latencyMs}ms` : ""}`,
        });
    } catch {
      setTest({ ok: false, text: "Network error — test not completed" });
    } finally {
      setTesting(false);
    }
  };

  const live = conn?.mode === "live";

  return (
    <section className="rounded-xl border border-gold-500/25 bg-gold-500/[0.05] p-4">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[0.88rem] font-semibold text-mist-100">
            <KeyRound size={15} className="text-gold-400" />
            API connection — base URL &amp; key
          </p>
          <p className="mt-1 max-w-xl text-[0.74rem] leading-relaxed text-mist-600">
            Saved to the server <code className="text-mist-400">.env</code> and applied immediately (no
            restart). The key is write-only — it is never displayed or sent back to this page.
          </p>
        </div>
        <span
          className={cn(
            "rounded-full border px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-wider",
            live
              ? "border-success/40 bg-success/10 text-success"
              : conn?.mode === "mock"
                ? "border-gold-500/40 bg-gold-500/10 text-gold-300"
                : "border-white/15 bg-white/[0.05] text-mist-400"
          )}
        >
          {conn ? conn.mode : "…"}
        </span>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Mode" hint="disabled = never forward · mock = simulate · live = real API">
          <Select className="select-dark" value={mode} onChange={(e) => setMode(e.target.value)}>
            {MODE_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Base URL" hint="https://partner.example.com/api — no trailing slash needed">
          <TextInput
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://…"
            spellCheck={false}
          />
        </Field>
        <Field
          label="API key"
          hint={conn?.hasApiKey ? "Saved in .env — leave blank to keep it." : "Not set yet."}
        >
          <div className="flex gap-2">
            <TextInput
              className="flex-1"
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={conn?.hasApiKey ? "••••••••••••" : "paste the partner API key"}
            />
            {conn?.hasApiKey && (
              <Btn variant="outline" onClick={() => post({ apiKey: "" }, "✓ API key removed")}>
                Remove
              </Btn>
            )}
          </div>
        </Field>
        <Field
          label="API secret (optional)"
          hint={conn?.hasApiSecret ? "Saved in .env — leave blank to keep it." : "Only if your partner docs require one."}
        >
          <div className="flex gap-2">
            <TextInput
              className="flex-1"
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              placeholder={conn?.hasApiSecret ? "••••••••••••" : "paste the secret"}
            />
            {conn?.hasApiSecret && (
              <Btn variant="outline" onClick={() => post({ apiSecret: "" }, "✓ API secret removed")}>
                Remove
              </Btn>
            )}
          </div>
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-3.5">
        <p
          className={cn(
            "text-[0.78rem]",
            test && test.ok && "text-success",
            test && !test.ok && "text-danger",
            !test && state.state === "saved" && "text-success",
            !test && state.state === "error" && "text-danger",
            !test && state.state === "saving" && "text-mist-500",
            !test && state.state === "idle" && "text-mist-600"
          )}
          role="status"
          aria-live="polite"
        >
          {test
            ? test.text
            : state.state === "saving"
              ? "Saving…"
              : state.state === "saved"
                ? state.message
                : state.state === "error"
                  ? (state.message ?? "Save failed")
                  : "Applied immediately — no server restart needed."}
        </p>
        <div className="flex items-center gap-2">
          <Btn variant="outline" onClick={runTest} disabled={testing}>
            {testing ? "Testing…" : "Test connection"}
          </Btn>
          <BusyBtn
            busy={state.state === "saving"}
            onClick={() => {
              setTest(null);
              return save();
            }}
          >
            Save connection
          </BusyBtn>
        </div>
      </div>
    </section>
  );
}

/* ── Telegram order alerts ───────────────────────────────────────── */

function TelegramFields({
  value,
  onChange,
}: {
  value: SettingsShape["telegram"];
  onChange: (v: SettingsShape["telegram"]) => void;
}) {
  const chatId = value.chatId.trim();

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Message title" hint="First line of every order alert">
          <TextInput
            value={value.title}
            maxLength={80}
            placeholder="Imalissa Orders"
            onChange={(e) => onChange({ ...value, title: e.target.value })}
          />
        </Field>
        <Field
          label="Chat ID"
          hint="Where alerts go — a group/channel id like -1001234567890, or your own user id"
        >
          <TextInput
            value={value.chatId}
            maxLength={60}
            placeholder="-1001234567890"
            onChange={(e) => onChange({ ...value, chatId: e.target.value })}
          />
        </Field>
      </div>

      {!chatId && (
        <p className="flex gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] p-3 text-[0.76rem] leading-relaxed text-amber-200/90">
          <Info size={14} className="mt-0.5 shrink-0" />
          No Chat ID saved yet — order alerts are switched off until you set one here.
        </p>
      )}

      <p className="flex gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3 text-[0.76rem] leading-relaxed text-mist-400">
        <Info size={14} className="mt-0.5 shrink-0" />
        Every placed order sends the full checkout details plus one photo per item to this chat.
        The bot token lives on the server in .env (TELEGRAM_BOT_TOKEN) — it is never entered or
        shown on this page. The bot must be added to the chat first (for a personal chat, send it
        one message).
      </p>
    </div>
  );
}
