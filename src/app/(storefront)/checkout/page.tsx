"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Check,
  CheckCircle2,
  CreditCard,
  Home,
  Loader2,
  MapPin,
  PackageCheck,
  Smartphone,
  Truck,
} from "lucide-react";
import { useStore } from "@/components/providers/AppProviders";
import { cn, formatBDT } from "@/lib/utils";

/**
 * Checkout wizard:
 *   1 Information → 2 Delivery address → 3 Shipping area →
 *   4 Payment → 5 Review → Place order
 *
 * Server is the source of truth for totals & availability; the client
 * sends an idempotencyKey so double-submits can't create two orders.
 */

interface Division {
  name: string;
  districts: string[];
}
interface SavedAddress {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  division: string;
  district: string;
  area: string;
  fullAddress: string;
  instructions: string | null;
}
interface CheckoutConfig {
  divisions: Division[];
  areas: Record<string, string[]>;
  delivery: {
    default: number;
    freeDeliveryMin: number;
    charges: Record<string, number>;
    instructions: string;
  };
  paymentMethods: { method: string; label: string; hint: string }[];
  addresses: SavedAddress[];
}
interface Estimate {
  subtotal: number;
  discount: number;
  couponCode: string | null;
  deliveryCharge: number;
  total: number;
}

const STEPS = ["Information", "Address", "Delivery", "Payment", "Review"] as const;

const paymentIcons: Record<string, React.ReactNode> = {
  COD: <Banknote size={18} />,
  BKASH: <Smartphone size={18} />,
  NAGAD: <Smartphone size={18} />,
  CARD: <CreditCard size={18} />,
};

// Deterministic idempotency key — stable across refreshes of this checkout.
function getCheckoutKey(): string {
  const KEY = "imalissa_checkout_key";
  try {
    let k = sessionStorage.getItem(KEY);
    if (!k) {
      k = crypto.randomUUID();
      sessionStorage.setItem(KEY, k);
    }
    return k;
  } catch {
    return `fallback-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

/**
 * The two delivery zones we actually serve. The zone is picked from the
 * address district — customers never select a zone that contradicts where the
 * parcel is going (that would quote the wrong charge), but both rows stay
 * visible so the other zone's price is never a mystery.
 *
 * Charges come from Site Settings → Checkout, the same source the server uses
 * in src/lib/delivery.ts: deliveryCharges["Dhaka"] and deliveryChargeDefault.
 */
/** Shipping zones the checkout offers (client mirror of lib/delivery). */
type ShippingZone = "dhaka" | "nationwide";

/** Zone implied by a district — Dhaka district → inside rate. */
function zoneForDistrict(d: string): ShippingZone {
  return d === "Dhaka" ? "dhaka" : "nationwide";
}

function shippingZonesFor(
  district: string,
  zone: ShippingZone,
  config?: CheckoutConfig | null
): {
  id: ShippingZone;
  title: string;
  desc: string;
  charge: number;
  active: boolean;
  disabled: boolean;
}[] {
  const inDhaka = district === "Dhaka";
  const dhakaCharge = config?.delivery.charges["Dhaka"] ?? 80;
  const outsideCharge = config?.delivery.default ?? 130;
  const where = district ? `Delivering to ${district} · ` : "";

  return [
    {
      id: "dhaka",
      title: "Standard Delivery — Inside Dhaka",
      desc: inDhaka
        ? `${where}Arrives in 2–5 working days · Cash on Delivery available`
        : "Dhaka district · Arrives in 2–5 working days · Cash on Delivery available",
      charge: dhakaCharge,
      active: zone === "dhaka",
      // Cheaper rate → only offered where it is actually valid, so a tap can
      // never pay ৳80 for a parcel going outside Dhaka (server checks too).
      disabled: !inDhaka,
    },
    {
      id: "nationwide",
      title: "Standard Delivery — Outside Dhaka",
      desc: !inDhaka && district
        ? `${where}Arrives in 3–7 working days across Bangladesh · Cash on Delivery available`
        : "All other districts · Arrives in 3–7 working days across Bangladesh · Cash on Delivery available",
      charge: outsideCharge,
      active: zone === "nationwide",
      disabled: false,
    },
  ];
}

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, cartLoading, refreshCart, applyCoupon, toast, user, userLoaded } = useStore();

  const [step, setStep] = useState(0);
  const [config, setConfig] = useState<CheckoutConfig | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [placing, setPlacing] = useState(false);
  const [savedAddressId, setSavedAddressId] = useState<string | null>(null);
  const [couponOpen, setCouponOpen] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    division: "Dhaka",
    district: "Dhaka",
    area: "",
    fullAddress: "",
    instructions: "",
    note: "",
    paymentMethod: "COD",
    saveAddress: true,
    /** Shipping zone the customer picks in step 3 (charges come from Settings). */
    shippingZone: "dhaka" as ShippingZone,
  });

  const set = useCallback(
    (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch })),
    []
  );

  // Load checkout config + prefill from user/addresses.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/checkout/config", { cache: "no-store" });
        const json = await res.json();
        if (json.ok) {
          const cfg: CheckoutConfig = json.data;
          setConfig(cfg);
          const def =
            cfg.addresses.find((a) => a.id) ??
            null;
          if (cfg.addresses.length > 0 && def) {
            setSavedAddressId(cfg.addresses[0].id);
            applyAddress(cfg.addresses[0]);
          }
        }
      } catch {
        /* config failed — form still works with defaults */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyAddress = (a: SavedAddress) => {
    setForm((f) => ({
      ...f,
      fullName: a.fullName,
      phone: a.phone,
      email: a.email ?? f.email,
      division: a.division,
      district: a.district,
      shippingZone: zoneForDistrict(a.district),
      area: a.area,
      fullAddress: a.fullAddress,
      instructions: a.instructions ?? "",
    }));
  };

  // Prefill identity for logged-in users.
  useEffect(() => {
    if (user) {
      setForm((f) => ({
        ...f,
        fullName: f.fullName || user.name,
        email: f.email || user.email || "",
        phone: f.phone || user.phone || "",
      }));
    }
  }, [user]);

  // Re-estimate totals whenever address/coupon/selected zone changes.
  // Charge = the zone the customer picked (Settings → Checkout numbers);
  // older clients that send no zone fall back to the district rule.
  const estimateTotals = useCallback(async () => {
    if (!form.district) return;
    try {
      const res = await fetch("/api/checkout/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          district: form.district,
          zone: form.shippingZone,
          couponCode: cart?.couponCode,
        }),
      });
      const json = await res.json();
      if (json.ok) setEstimate(json.data as Estimate);
    } catch {
      /* keep previous */
    }
  }, [form.district, form.shippingZone, cart?.couponCode]);

  useEffect(() => {
    if (cart && cart.itemCount > 0) estimateTotals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.district, form.shippingZone, cart?.couponCode, cart?.itemCount]);

  const items = cart?.items ?? [];

  // Login required to checkout: guests can browse & fill the cart, but the
  // wizard itself only runs for a signed-in account (server enforces it too).
  useEffect(() => {
    if (userLoaded && !user) {
      router.replace("/auth/login?next=/checkout");
    }
  }, [userLoaded, user, router]);

  useEffect(() => {
    if (!cartLoading && items.length === 0 && !placing) {
      router.replace("/cart");
    }
  }, [cartLoading, items.length, placing, router]);

  const districtList = useMemo(() => {
    return config?.divisions.find((d) => d.name === form.division)?.districts ?? [form.district];
  }, [config, form.division, form.district]);

  // ── Validation per step ────────────────────────────────────
  const infoValid = form.fullName.trim().length >= 2 && /^01[3-9]\d{8}$/.test(form.phone);
  const addressValid =
    form.district.trim().length >= 1 && form.area.trim().length >= 1 && form.fullAddress.trim().length >= 8;
  const deliveryValid = true;
  const paymentValid = Boolean(form.paymentMethod);

  const stepValid = [infoValid, addressValid, deliveryValid, paymentValid, true][step];

  const districtAreaOptions = (config?.areas?.[form.district] ?? config?.areas?.[form.district?.split(" ")[0] ?? ""] ?? []) as string[];

  // ── Place order ────────────────────────────────────────────
  const placeOrder = async () => {
    if (submitting) return; // hard guard against double-click
    setSubmitting(true);
    setPlacing(true);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: {
            fullName: form.fullName.trim(),
            phone: form.phone.trim(),
            email: form.email.trim() || undefined,
            division: form.division,
            district: form.district,
            area: form.area,
            fullAddress: form.fullAddress.trim(),
            instructions: form.instructions.trim() || undefined,
          },
          paymentMethod: form.paymentMethod,
          shippingZone: form.shippingZone,
          couponCode: cart?.couponCode ?? null,
          customerNote: form.note.trim() || undefined,
          saveAddress: form.saveAddress,
          idempotencyKey: getCheckoutKey(),
        }),
      });

      const json = await res.json();

      if (!json.ok) {
        toast(json.message ?? "Could not place your order", "error");
        setPlacing(false);
        setSubmitting(false);
        return;
      }

      // Reset the idempotency key — next checkout is a new order.
      try {
        sessionStorage.removeItem("imalissa_checkout_key");
      } catch { /* ignore */ }

      await refreshCart();
      router.push(`/order-confirmed?order=${encodeURIComponent(json.data.orderNumber)}&sync=${encodeURIComponent(json.data.sync?.status ?? "")}`);
    } catch {
      toast("Network error — your order was NOT placed. Please try again.", "error");
      setPlacing(false);
      setSubmitting(false);
    }
  };

  // Wait for the session lookup, and show a neutral state while a guest is
  // being forwarded to the login page (never render the wizard for them).
  if (!userLoaded || (userLoaded && !user)) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16">
        <div className="space-y-4">
          <div className="skeleton h-10 w-64 rounded-xl" />
          <div className="skeleton h-72 rounded-2xl" />
          <p className="text-sm text-mist-500">
            {userLoaded
              ? "Please sign in to continue to checkout…"
              : "Checking your session…"}
          </p>
        </div>
      </div>
    );
  }

  if (cartLoading && !config) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16">
        <div className="space-y-4">
          <div className="skeleton h-10 w-64 rounded-xl" />
          <div className="skeleton h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-2 font-display text-3xl font-bold text-mist-50">Checkout</h1>
      <p className="mb-7 text-sm text-mist-500">
        {items.length} item{items.length === 1 ? "" : "s"} ·{" "}
        <span className="text-gold-400">
          {formatBDT(estimate?.subtotal ?? cart?.subtotal ?? 0)}
        </span>
      </p>

      {/* Stepper */}
      <ol className="mb-8 flex flex-wrap items-center gap-x-1 gap-y-2">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center">
            <button
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              className={cn(
                "flex items-center gap-2 rounded-full px-3 py-1.5 text-[0.76rem] font-medium transition",
                i < step && "text-success cursor-pointer",
                i === step && "bg-gold-500/15 text-gold-300 border border-gold-500/40",
                i > step && "text-mist-600"
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full text-[0.65rem] font-bold",
                  i < step ? "bg-success/20 text-success" : i === step ? "bg-gold-500 text-ink-950" : "bg-white/[0.06] text-mist-500"
                )}
              >
                {i < step ? <Check size={11} /> : i + 1}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-5 bg-white/10 sm:w-8" />}
          </li>
        ))}
      </ol>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        {/* ── Form panel ─────────────────────────────────── */}
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 sm:p-7">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -18 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Step 0 — Information */}
              {step === 0 && (
                <section>
                  <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-semibold text-mist-50">
                    <Home size={17} className="text-gold-500" /> Contact information
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Full name" required>
                      <input
                        className="input-premium"
                        value={form.fullName}
                        onChange={(e) => set({ fullName: e.target.value })}
                        placeholder="Receiver's full name"
                        autoComplete="name"
                      />
                    </Field>
                    <Field label="Mobile number" required>
                      <input
                        className="input-premium"
                        value={form.phone}
                        onChange={(e) => set({ phone: e.target.value.replace(/\D/g, "").slice(0, 11) })}
                        placeholder="01712345678"
                        inputMode="numeric"
                        autoComplete="tel"
                      />
                      {form.phone && !/^01[3-9]\d{8}$/.test(form.phone) && (
                        <p className="mt-1 text-[0.72rem] text-danger">
                          Enter a valid BD mobile number
                        </p>
                      )}
                    </Field>
                    <Field label="Email (optional)">
                      <input
                        className="input-premium"
                        value={form.email}
                        onChange={(e) => set({ email: e.target.value })}
                        placeholder="you@example.com"
                        autoComplete="email"
                      />
                    </Field>
                  </div>
                </section>
              )}

              {/* Step 1 — Address */}
              {step === 1 && (
                <section>
                  <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-semibold text-mist-50">
                    <MapPin size={17} className="text-gold-500" /> Delivery address
                  </h2>

                  {config && config.addresses.length > 0 && (
                    <div className="mb-5 space-y-2">
                      {config.addresses.map((a) => (
                        <button
                          key={a.id}
                          onClick={() => {
                            setSavedAddressId(a.id);
                            applyAddress(a);
                          }}
                          className={cn(
                            "flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition",
                            savedAddressId === a.id
                              ? "border-gold-500/50 bg-gold-500/[0.07]"
                              : "border-white/10 hover:border-gold-500/30"
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                              savedAddressId === a.id ? "border-gold-500 bg-gold-500" : "border-white/25"
                            )}
                          >
                            {savedAddressId === a.id && <Check size={10} className="text-ink-950" />}
                          </span>
                          <span className="text-[0.84rem]">
                            <span className="block font-medium text-mist-100">
                              {a.fullName} · {a.phone}
                            </span>
                            <span className="block text-mist-500">
                              {a.fullAddress}, {a.area}, {a.district}
                            </span>
                          </span>
                        </button>
                      ))}
                      <button
                        onClick={() => {
                          setSavedAddressId(null);
                          set({
                            fullName: "",
                            phone: "",
                            area: "",
                            fullAddress: "",
                            instructions: "",
                          });
                        }}
                        className="text-[0.8rem] text-gold-400 transition hover:text-gold-300"
                      >
                        + Use a different address
                      </button>
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Division" required>
                      <select
                        className="input-premium appearance-none"
                        value={form.division}
                        onChange={(e) =>
                          set({
                            division: e.target.value,
                            district: "",
                            area: "",
                            shippingZone: "nationwide",
                          })
                        }
                      >
                        {(config?.divisions ?? [{ name: "Dhaka", districts: [] }]).map((d) => (
                          <option key={d.name} value={d.name} className="bg-ink-850">
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="District" required>
                      <select
                        className="input-premium appearance-none"
                        value={form.district}
                        onChange={(e) =>
                          set({
                            district: e.target.value,
                            area: "",
                            shippingZone: zoneForDistrict(e.target.value),
                          })
                        }
                      >
                        <option value="" className="bg-ink-850">
                          Select district
                        </option>
                        {districtList.map((d) => (
                          <option key={d} value={d} className="bg-ink-850">
                            {d}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Area / Thana" required>
                      {districtAreaOptions.length > 0 ? (
                        <select
                          className="input-premium appearance-none"
                          value={form.area}
                          onChange={(e) => set({ area: e.target.value })}
                        >
                          <option value="" className="bg-ink-850">
                            Select area
                          </option>
                          {districtAreaOptions.map((a) => (
                            <option key={a} value={a.trim()} className="bg-ink-850">
                              {a.trim()}
                            </option>
                          ))}
                          <option value="Other" className="bg-ink-850">
                            Other area
                          </option>
                        </select>
                      ) : (
                        <input
                          className="input-premium"
                          value={form.area}
                          onChange={(e) => set({ area: e.target.value })}
                          placeholder="Area / Thana"
                        />
                      )}
                      {form.area === "Other" && (
                        <input
                          className="input-premium mt-2"
                          value={form.area === "Other" ? "" : form.area}
                          onChange={(e) => set({ area: e.target.value })}
                          placeholder="Type your area"
                        />
                      )}
                    </Field>
                    <Field label="Full address" required className="sm:col-span-2">
                      <textarea
                        className="input-premium min-h-20 resize-y"
                        value={form.fullAddress}
                        onChange={(e) => set({ fullAddress: e.target.value })}
                        placeholder="House, road, block, landmark…"
                      />
                    </Field>
                    <Field label="Delivery instructions (optional)" className="sm:col-span-2">
                      <input
                        className="input-premium"
                        value={form.instructions}
                        onChange={(e) => set({ instructions: e.target.value })}
                        placeholder="e.g. Call before delivery, leave at guard…"
                      />
                    </Field>
                  </div>

                  {user && (
                    <label className="mt-4 flex items-center gap-2.5 text-[0.84rem] text-mist-300">
                      <input
                        type="checkbox"
                        checked={form.saveAddress}
                        onChange={(e) => set({ saveAddress: e.target.checked })}
                        className="accent-gold-500"
                      />
                      Save this address to my account
                    </label>
                  )}
                </section>
              )}

              {/* Step 2 — Shipping */}
              {step === 2 && (
                <section>
                  <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-semibold text-mist-50">
                    <Truck size={17} className="text-gold-500" /> Shipping method
                  </h2>

                  <div className="space-y-3">
                    {shippingZonesFor(form.district, form.shippingZone, config).map((z) => (
                      <button
                        key={z.id}
                        type="button"
                        disabled={z.disabled}
                        aria-pressed={z.active}
                        onClick={() => set({ shippingZone: z.id })}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-xl border p-4 text-left transition",
                          z.active
                            ? "border-gold-500/40 bg-gold-500/[0.06]"
                            : z.disabled
                              ? "cursor-not-allowed border-white/10 bg-white/[0.02] opacity-60"
                              : "cursor-pointer border-white/12 bg-white/[0.02] hover:border-gold-500/40 hover:bg-gold-500/[0.05]"
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                            z.active ? "border-gold-500" : "border-white/25"
                          )}
                        >
                          {z.active && <span className="h-2 w-2 rounded-full bg-gold-500" />}
                        </span>
                        <span className="flex-1">
                          <span
                            className={cn(
                              "flex flex-wrap items-center gap-2 text-[0.9rem] font-semibold",
                              z.active ? "text-mist-100" : "text-mist-400"
                            )}
                          >
                            {z.title}
                            {z.active && (
                              <span className="rounded-full border border-gold-500/40 bg-gold-500/10 px-2 py-0.5 text-[0.64rem] font-medium uppercase tracking-wider text-gold-300">
                                Selected
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block text-[0.78rem] text-mist-500">
                            {z.desc}
                          </span>
                          {z.disabled ? (
                            <span className="mt-1 block text-[0.72rem] text-mist-600">
                              Only for addresses inside Dhaka district — your address is in{" "}
                              {form.district || "another district"}.
                            </span>
                          ) : !z.active ? (
                            <span className="mt-1 block text-[0.72rem] text-gold-500/70">
                              Tap to select this delivery option
                            </span>
                          ) : null}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 font-semibold",
                            z.active ? "text-gold-300" : "text-mist-500"
                          )}
                        >
                          {z.active
                            ? estimate?.deliveryCharge === 0
                              ? "FREE"
                              : formatBDT(estimate?.deliveryCharge ?? z.charge)
                            : formatBDT(z.charge)}
                        </span>
                      </button>
                    ))}
                  </div>

                  {config && config.delivery.freeDeliveryMin > 0 && (
                    <p className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-[0.8rem] text-mist-400">
                      💡 Free delivery on orders over{" "}
                      <span className="text-gold-300">
                        {formatBDT(config.delivery.freeDeliveryMin)}
                      </span>
                      {estimate && estimate.subtotal < config.delivery.freeDeliveryMin && (
                        <>
                          {" "}- add{" "}
                          <span className="text-gold-300">
                            {formatBDT(config.delivery.freeDeliveryMin - estimate.subtotal)}
                          </span>{" "}
                          to qualify
                        </>
                      )}
                    </p>
                  )}

                  <Field label="Order note for us (optional)" className="mt-5">
                    <textarea
                      className="input-premium min-h-16 resize-y"
                      value={form.note}
                      onChange={(e) => set({ note: e.target.value })}
                      placeholder="Anything you'd like us to know about this order…"
                    />
                  </Field>
                </section>
              )}

              {/* Step 3 — Payment */}
              {step === 3 && (
                <section>
                  <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-semibold text-mist-50">
                    <CreditCard size={17} className="text-gold-500" /> Payment method
                  </h2>

                  <div className="space-y-3">
                    {(config?.paymentMethods ?? [{ method: "COD", label: "Cash on Delivery", hint: "Pay when your order arrives" }]).map(
                      (m) => (
                        <button
                          key={m.method}
                          onClick={() => set({ paymentMethod: m.method })}
                          className={cn(
                            "flex w-full items-center gap-3.5 rounded-xl border p-4 text-left transition",
                            form.paymentMethod === m.method
                              ? "border-gold-500/50 bg-gold-500/[0.07] shadow-[0_0_0_3px_rgba(212,175,55,0.1)]"
                              : "border-white/10 hover:border-gold-500/30"
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-10 w-10 items-center justify-center rounded-lg border",
                              form.paymentMethod === m.method
                                ? "border-gold-500/50 bg-gold-500/15 text-gold-300"
                                : "border-white/10 bg-white/[0.03] text-mist-400"
                            )}
                          >
                            {paymentIcons[m.method] ?? <Banknote size={18} />}
                          </span>
                          <span className="flex-1">
                            <span className="block text-[0.9rem] font-semibold text-mist-100">
                              {m.label}
                            </span>
                            {m.hint && (
                              <span className="block text-[0.75rem] text-mist-500">{m.hint}</span>
                            )}
                          </span>
                          <span
                            className={cn(
                              "flex h-5 w-5 items-center justify-center rounded-full border-2",
                              form.paymentMethod === m.method
                                ? "border-gold-500 bg-gold-500 text-ink-950"
                                : "border-white/25"
                            )}
                          >
                            {form.paymentMethod === m.method && <Check size={11} />}
                          </span>
                        </button>
                      )
                    )}
                  </div>

                  {form.paymentMethod === "COD" && (
                    <p className="mt-4 rounded-lg border border-success/25 bg-success/[0.07] px-4 py-3 text-[0.8rem] text-success">
                      You'll pay <strong>{formatBDT(estimate?.total ?? 0)}</strong> in cash when
                      your order arrives. Please keep the exact change ready.
                    </p>
                  )}
                </section>
              )}

              {/* Step 4 — Review */}
              {step === 4 && (
                <section>
                  <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-semibold text-mist-50">
                    <PackageCheck size={17} className="text-gold-500" /> Review your order
                  </h2>

                  <div className="space-y-4">
                    <ReviewBlock
                      title="Deliver to"
                      onEdit={() => setStep(1)}
                      lines={[
                        form.fullName,
                        form.phone,
                        form.email || undefined,
                        `${form.fullAddress}, ${form.area}, ${form.district}, ${form.division}`,
                        form.instructions ? `Note: ${form.instructions}` : undefined,
                      ]}
                    />
                    <ReviewBlock
                      title="Shipping method"
                      onEdit={() => setStep(2)}
                      lines={[
                        shippingZonesFor(form.district, form.shippingZone, config).find(
                          (z) => z.active
                        )?.title ?? "Standard delivery",
                        estimate?.deliveryCharge === 0
                          ? "Delivery charge: FREE"
                          : `Delivery charge: ${formatBDT(estimate?.deliveryCharge ?? 0)}`,
                      ]}
                    />
                    <ReviewBlock
                      title="Payment"
                      onEdit={() => setStep(3)}
                      lines={[
                        config?.paymentMethods.find((m) => m.method === form.paymentMethod)?.label ??
                          form.paymentMethod,
                      ]}
                    />
                    <ReviewBlock
                      title={`Items (${cart?.itemCount ?? 0})`}
                      onEdit={() => router.push("/cart")}
                      items={items.map((i) => ({
                        name: i.name + (i.variantLabel ? ` — ${i.variantLabel}` : ""),
                        qty: i.quantity,
                        total: formatBDT(i.lineTotal),
                        image: i.image,
                        slug: i.slug,
                      }))}
                    />
                  </div>
                </section>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Navigation */}
          {!placing && (
            <div className="mt-7 flex items-center justify-between border-t border-white/[0.07] pt-5">
              <button
                onClick={() => (step === 0 ? router.push("/cart") : setStep((s) => s - 1))}
                className="flex items-center gap-1.5 text-[0.84rem] text-mist-400 transition hover:text-gold-300"
              >
                <ArrowLeft size={15} />
                {step === 0 ? "Return to cart" : "Back"}
              </button>

              {step < STEPS.length - 1 ? (
                <button
                  onClick={() => stepValid && setStep((s) => s + 1)}
                  disabled={!stepValid}
                  className="btn-gold flex items-center gap-2 rounded-xl px-7 py-3 text-sm disabled:opacity-40"
                >
                  Continue <ArrowRight size={15} />
                </button>
              ) : (
                <button
                  onClick={placeOrder}
                  disabled={submitting}
                  className="btn-gold flex items-center gap-2 rounded-xl px-8 py-3 text-sm disabled:opacity-60"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Placing order…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} /> Place Order · {formatBDT(estimate?.total ?? 0)}
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {placing && (
            <div className="mt-7 flex flex-col items-center gap-3 border-t border-white/[0.07] pt-6">
              <Loader2 size={28} className="animate-spin text-gold-500" />
              <p className="text-sm text-mist-300">
                Securing your order &amp; notifying our fulfillment partner…
              </p>
              <p className="text-[0.72rem] text-mist-600">
                Please don't refresh or press back.
              </p>
            </div>
          )}
        </div>

        {/* ── Summary sidebar ────────────────────────────── */}
        <aside className="lg:sticky lg:top-36 lg:h-fit">
          <div className="rounded-2xl border border-gold-500/20 bg-gradient-to-b from-ink-800 to-ink-900 p-5">
            <h3 className="font-display text-lg font-semibold text-gold-gradient">Summary</h3>

            <div className="mt-4 max-h-56 space-y-3 overflow-y-auto pr-1">
              {items.map((i) => (
                <div key={i.id} className="flex items-center gap-3">
                  <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-ink-850">
                    {i.image?.endsWith(".svg") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={i.image} alt="" className="h-full w-full object-cover" />
                    ) : i.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={i.image} alt="" className="h-full w-full object-cover" />
                    ) : null}
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-500 px-1 text-[0.6rem] font-bold text-ink-950">
                      {i.quantity}
                    </span>
                  </div>
                  <p className="line-clamp-1 flex-1 text-[0.78rem] text-mist-300">{i.name}</p>
                  <p className="text-[0.78rem] text-mist-200">{formatBDT(i.lineTotal)}</p>
                </div>
              ))}
            </div>

            <div className="divider-gold my-4" />

            {/* Coupon */}
            <div className="mb-3">
              {cart?.couponCode ? (
                <div className="flex items-center justify-between rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-[0.78rem] text-success">
                  <span>
                    <strong>{cart.couponCode}</strong>{" "}
                    {estimate?.discount ? `(-${formatBDT(estimate.discount)})` : "applied"}
                  </span>
                  <button
                    onClick={() => {
                      setCouponInput("");
                      applyCoupon(null);
                    }}
                    className="text-mist-400 hover:text-danger"
                  >
                    remove
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setCouponOpen((v) => !v)}
                    className="flex items-center gap-1.5 text-[0.78rem] text-gold-400 transition hover:text-gold-300"
                  >
                    Have a coupon code?
                  </button>
                  {couponOpen && (
                    <div className="mt-2 flex gap-2">
                      <input
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                        placeholder="WELCOME10"
                        className="input-premium !py-2 text-[0.8rem] uppercase"
                      />
                      <button
                        onClick={() => applyCoupon(couponInput.trim() || null)}
                        className="btn-outline-gold rounded-lg px-3 text-[0.78rem]"
                      >
                        Apply
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="space-y-2 text-[0.85rem]">
              <Row label="Subtotal" value={formatBDT(estimate?.subtotal ?? cart?.subtotal ?? 0)} />
              {(estimate?.discount ?? 0) > 0 && (
                <Row
                  label={`Discount${estimate?.couponCode ? ` (${estimate.couponCode})` : ""}`}
                  value={`-${formatBDT(estimate!.discount)}`}
                  tone="success"
                />
              )}
              <Row
                label="Delivery"
                value={
                  (estimate?.deliveryCharge ?? 1) === 0
                    ? "FREE"
                    : formatBDT(estimate?.deliveryCharge ?? config?.delivery.default ?? 130)
                }
              />
              <div className="divider-gold" />
              <div className="flex items-end justify-between pt-1">
                <span className="font-semibold text-mist-200">Total</span>
                <span className="font-display text-2xl font-bold text-gold-gradient">
                  {formatBDT(estimate?.total ?? cart?.subtotal ?? 0)}
                </span>
              </div>
            </div>

            <p className="mt-4 flex items-start gap-2 text-[0.7rem] text-mist-600">
              <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-success" />
              Your order is protected by Imalissa's buyer guarantee.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-[0.78rem] font-semibold text-mist-300">
        {label} {required && <span className="text-gold-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success";
}) {
  return (
    <div className={cn("flex justify-between", tone === "success" ? "text-success" : "text-mist-400")}>
      <span>{label}</span>
      <span className={tone === "success" ? "" : "text-mist-100"}>{value}</span>
    </div>
  );
}

function ReviewBlock({
  title,
  lines,
  items,
  onEdit,
}: {
  title: string;
  lines?: (string | undefined | null)[];
  items?: { name: string; qty: number; total: string; image?: string | null; slug: string }[];
  onEdit: () => void;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[0.76rem] font-bold uppercase tracking-[0.16em] text-gold-500">
          {title}
        </h3>
        <button
          onClick={onEdit}
          className="text-[0.76rem] text-mist-500 underline transition hover:text-gold-300"
        >
          Edit
        </button>
      </div>
      {lines && (
        <div className="space-y-0.5 text-[0.85rem] text-mist-300">
          {lines.filter(Boolean).map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </div>
      )}
      {items && (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-3 text-[0.85rem]">
              {it.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.image} alt="" className="h-9 w-9 rounded-md border border-white/10 object-cover" />
              )}
              <span className="flex-1 text-mist-300">
                {it.name} <span className="text-mist-600">× {it.qty}</span>
              </span>
              <span className="text-mist-200">{it.total}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
