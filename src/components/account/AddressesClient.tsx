"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Home, Building2, MapPinned, Plus, Star, Trash2, Pencil, Loader2 } from "lucide-react";
import { useStore } from "@/components/providers/AppProviders";
import { AccountPanel } from "@/components/account/AccountShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";

interface Address {
  id: string;
  type: "HOME" | "OFFICE" | "OTHER";
  fullName: string;
  phone: string;
  email: string | null;
  division: string;
  district: string;
  area: string;
  fullAddress: string;
  instructions: string | null;
  isDefault: boolean;
}

interface Division {
  name: string;
  districts: string[];
}

const EMPTY: Omit<Address, "id"> = {
  type: "HOME",
  fullName: "",
  phone: "",
  email: "",
  division: "Dhaka",
  district: "Dhaka",
  area: "",
  fullAddress: "",
  instructions: "",
  isDefault: false,
};

const TYPE_ICON = { HOME: Home, OFFICE: Building2, OTHER: MapPinned };

/** Saved addresses: list + create/edit form + delete/default. */
export function AddressesClient() {
  const { toast } = useStore();
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [areas, setAreas] = useState<Record<string, string[]>>({});
  const [editing, setEditing] = useState<Address | "new" | null>(null);
  const [form, setForm] = useState<Omit<Address, "id">>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [listRes, cfgRes] = await Promise.all([
      fetch("/api/account/addresses"),
      fetch("/api/checkout/config"),
    ]);
    const listJson = await listRes.json().catch(() => ({ ok: false }));
    const cfgJson = await cfgRes.json().catch(() => ({ ok: false }));
    if (listJson.ok) setAddresses(listJson.data as Address[]);
    else setAddresses([]);
    if (cfgJson.ok) {
      setDivisions((cfgJson.data as { divisions: Division[] }).divisions ?? []);
      setAreas(((cfgJson.data as { areas: Record<string, string[]> }).areas ?? {}) as Record<string, string[]>);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setForm({
      ...EMPTY,
      fullName: "",
      phone: "",
    });
    setErrors({});
    setEditing("new");
  };

  const openEdit = (a: Address) => {
    setForm({
      type: a.type,
      fullName: a.fullName,
      phone: a.phone,
      email: a.email ?? "",
      division: a.division,
      district: a.district,
      area: a.area,
      fullAddress: a.fullAddress,
      instructions: a.instructions ?? "",
      isDefault: a.isDefault,
    });
    setErrors({});
    setEditing(a);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (form.fullName.trim().length < 2) errs.fullName = "Enter the recipient's name";
    if (!/^01[3-9]\d{8}$/.test(form.phone.replace(/[\s-]/g, "")))
      errs.phone = "Enter a valid BD mobile number";
    if (!form.area.trim()) errs.area = "Enter your area / thana";
    if (form.fullAddress.trim().length < 8)
      errs.fullAddress = "Please write a detailed address (house, road, block…)";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const save = async () => {
    if (!validate() || busy) return;
    setBusy(true);
    try {
      const isEdit = editing !== "new" && editing !== null;
      const res = await fetch("/api/account/addresses", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(isEdit ? { id: (editing as Address).id } : {}), ...form }),
      });
      const json = await res.json().catch(() => ({ ok: false }));
      if (!json.ok) {
        toast(json.message ?? "Could not save address", "error");
        return;
      }
      toast(isEdit ? "Address updated" : "Address added", "success");
      setEditing(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    const res = await fetch(`/api/account/addresses?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const json = await res.json().catch(() => ({ ok: false }));
    if (json.ok) {
      toast("Address removed", "info");
      setAddresses((list) => (list ? list.filter((a) => a.id !== id) : list));
    } else {
      toast(json.message ?? "Could not remove address", "error");
    }
  };

  const districts = divisions.find((d) => d.name === form.division)?.districts ?? [];
  const areaSuggestions = areas[form.district] ?? [];

  if (addresses === null) {
    return (
      <AccountPanel title="Saved Addresses">
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="skeleton h-28 rounded-xl" />
          ))}
        </div>
      </AccountPanel>
    );
  }

  return (
    <div className="space-y-5">
      <AccountPanel
        title="Saved Addresses"
        subtitle="Faster checkout — pick an address in one tap"
        action={
          <button onClick={openNew} className="btn-gold flex items-center gap-2 rounded-xl px-4 py-2.5 text-[0.84rem]">
            <Plus size={15} /> Add address
          </button>
        }
      >
        {addresses.length === 0 && !editing ? (
          <EmptyState
            title="No saved addresses"
            description="Add your delivery addresses to check out faster next time. Use the button above."
            icon={<MapPinned size={26} />}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {addresses.map((a) => {
              const Icon = TYPE_ICON[a.type] ?? Home;
              return (
                <div
                  key={a.id}
                  className={cn(
                    "relative rounded-xl border p-4",
                    a.isDefault
                      ? "border-gold-500/40 bg-gold-500/[0.05]"
                      : "border-white/[0.08] bg-white/[0.02]"
                  )}
                >
                  {a.isDefault && (
                    <span className="absolute right-3 top-3 rounded-full border border-gold-500/40 bg-gold-500/10 px-2 py-0.5 text-[0.66rem] font-bold uppercase tracking-wide text-gold-300">
                      Default
                    </span>
                  )}
                  <div className="flex items-center gap-2 text-gold-400">
                    <Icon size={15} />
                    <span className="text-[0.72rem] font-bold uppercase tracking-[0.16em]">
                      {a.type}
                    </span>
                  </div>
                  <p className="mt-2 font-semibold text-mist-100">{a.fullName}</p>
                  <p className="text-[0.8rem] text-mist-400">{a.phone}</p>
                  <p className="mt-2 text-[0.84rem] leading-relaxed text-mist-300">
                    {a.fullAddress}
                  </p>
                  <p className="text-[0.8rem] text-mist-500">
                    {a.area ? `${a.area}, ` : ""}
                    {a.district}, {a.division}
                  </p>

                  <div className="mt-3 flex items-center gap-3 border-t border-white/[0.07] pt-3 text-[0.78rem]">
                    <button
                      onClick={() => openEdit(a)}
                      className="flex items-center gap-1.5 text-mist-400 transition hover:text-gold-300"
                    >
                      <Pencil size={13} /> Edit
                    </button>
                    {!a.isDefault && (
                      <button
                        onClick={async () => {
                          await fetch("/api/account/addresses", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: a.id, isDefault: true }),
                          });
                          toast("Default address updated", "success");
                          load();
                        }}
                        className="flex items-center gap-1.5 text-mist-400 transition hover:text-gold-300"
                      >
                        <Star size={13} /> Set default
                      </button>
                    )}
                    <button
                      onClick={() => remove(a.id)}
                      className="ml-auto flex items-center gap-1.5 text-mist-500 transition hover:text-danger"
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AccountPanel>

      {/* ── Add / edit form ─────────────────────────────── */}
      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
          >
            <AccountPanel
              title={editing === "new" ? "New Address" : "Edit Address"}
              subtitle="Used for delivery — keep it accurate to avoid delays"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="Address type"
                  value={form.type}
                  onChange={(v) => setForm((f) => ({ ...f, type: v as Address["type"] }))}
                  options={[
                    { value: "HOME", label: "Home" },
                    { value: "OFFICE", label: "Office" },
                    { value: "OTHER", label: "Other" },
                  ]}
                />
                <Input
                  label="Recipient name"
                  value={form.fullName}
                  onChange={(v) => setForm((f) => ({ ...f, fullName: v }))}
                  error={errors.fullName}
                  placeholder="e.g. Rafiq Hasan"
                />
                <Input
                  label="Mobile number"
                  value={form.phone}
                  onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
                  error={errors.phone}
                  placeholder="01712345678"
                  inputMode="numeric"
                />
                <Input
                  label="Email (optional)"
                  value={form.email ?? ""}
                  onChange={(v) => setForm((f) => ({ ...f, email: v }))}
                  placeholder="you@example.com"
                />
                <Select
                  label="Division"
                  value={form.division}
                  onChange={(v) => {
                    const firstDistrict =
                      divisions.find((d) => d.name === v)?.districts[0] ?? form.district;
                    setForm((f) => ({ ...f, division: v, district: firstDistrict }));
                  }}
                  options={divisions.map((d) => ({ value: d.name, label: d.name }))}
                />
                <Select
                  label="District"
                  value={form.district}
                  onChange={(v) => setForm((f) => ({ ...f, district: v }))}
                  options={districts.map((d) => ({ value: d, label: d }))}
                />
                <div className="sm:col-span-2">
                  <Input
                    label="Area / Thana"
                    value={form.area}
                    onChange={(v) => setForm((f) => ({ ...f, area: v }))}
                    error={errors.area}
                    placeholder={
                      areaSuggestions.length ? `e.g. ${areaSuggestions[0]}` : "e.g. Dhanmondi"
                    }
                    list="area-suggestions"
                  />
                  <datalist id="area-suggestions">
                    {areaSuggestions.map((a) => (
                      <option key={a} value={a} />
                    ))}
                  </datalist>
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-[0.78rem] font-semibold text-mist-300">
                    Full address
                  </label>
                  <textarea
                    className="input-premium min-h-24 resize-y"
                    value={form.fullAddress}
                    onChange={(e) => setForm((f) => ({ ...f, fullAddress: e.target.value }))}
                    placeholder="House 12, Road 5, Block C…"
                  />
                  {errors.fullAddress && (
                    <p className="mt-1 text-[0.76rem] text-danger">{errors.fullAddress}</p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <Input
                    label="Delivery instructions (optional)"
                    value={form.instructions ?? ""}
                    onChange={(v) => setForm((f) => ({ ...f, instructions: v }))}
                    placeholder="Landmark, best time to call…"
                  />
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-[0.84rem] text-mist-300">
                  <input
                    type="checkbox"
                    className="accent-gold-500"
                    checked={form.isDefault}
                    onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
                  />
                  Set as default address
                </label>
              </div>

              <div className="mt-5 flex gap-3">
                <button
                  onClick={save}
                  disabled={busy}
                  className="btn-gold flex items-center gap-2 rounded-xl px-6 py-3 text-sm"
                >
                  {busy && <Loader2 size={15} className="animate-spin" />}
                  {editing === "new" ? "Save Address" : "Update Address"}
                </button>
                <button
                  onClick={() => setEditing(null)}
                  className="rounded-xl border border-white/10 px-6 py-3 text-sm text-mist-400 transition hover:text-mist-200"
                >
                  Cancel
                </button>
              </div>
            </AccountPanel>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  error,
  placeholder,
  inputMode,
  list,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  placeholder?: string;
  inputMode?: "numeric" | "text";
  list?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[0.78rem] font-semibold text-mist-300">{label}</label>
      <input
        className="input-premium"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        list={list}
      />
      {error && <p className="mt-1 text-[0.76rem] text-danger">{error}</p>}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[0.78rem] font-semibold text-mist-300">{label}</label>
      <select className="input-premium" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-ink-900">
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
