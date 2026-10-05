"use client";

import { useState } from "react";
import { Loader2, Mail, MapPin, MessageSquare, Phone, Clock, Send } from "lucide-react";
import { useStore } from "@/components/providers/AppProviders";
import { isBdPhone, isEmail, normalizePhone } from "@/lib/validation";

interface ContactInfo {
  phone: string;
  email: string;
  address: string;
  hours: string;
  facebook: string;
  instagram: string;
  youtube: string;
}

/** Contact form — posts to /api/contact (rate limited, stored for admin). */
export function ContactForm({ contact }: { contact: ContactInfo }) {
  const { toast } = useStore();
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const validate = () => {
    const errs: Record<string, string> = {};
    if (form.name.trim().length < 2) errs.name = "Please enter your name";
    if (form.email.trim() && !isEmail(form.email)) errs.email = "Enter a valid email";
    if (form.phone.trim() && !isBdPhone(normalizePhone(form.phone)))
      errs.phone = "Enter a valid BD mobile number";
    if (form.subject.trim().length < 2) errs.subject = "Enter a subject";
    if (form.message.trim().length < 10) errs.message = "Please write a bit more detail";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !validate()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() ? normalizePhone(form.phone) : "",
          subject: form.subject.trim(),
          message: form.message.trim(),
        }),
      });
      const json = await res.json().catch(() => ({ ok: false }));
      if (json.ok) {
        setSent(true);
        setForm({ name: "", email: "", phone: "", subject: "", message: "" });
        toast("Message sent — we'll get back to you", "success");
      } else {
        toast(json.message ?? "Could not send message", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* Form */}
      <div className="rounded-3xl border border-white/[0.08] bg-white/[0.02] p-6 sm:p-8">
        <h2 className="font-display text-xl font-semibold text-mist-50">Send us a message</h2>
        <p className="mt-1 text-sm text-mist-500">
          Fill in the form and our team will respond during business hours.
        </p>

        {sent ? (
          <div className="mt-6 rounded-2xl border border-success/30 bg-success/10 p-6 text-center">
            <MessageSquare size={26} className="mx-auto text-success" />
            <p className="mt-3 font-display text-lg text-mist-100">Message received</p>
            <p className="mt-1 text-sm text-mist-400">
              Thanks for reaching out. We&apos;ll reply to {form.email || "your contact details"}{" "}
              as soon as we can.
            </p>
            <button
              onClick={() => setSent(false)}
              className="btn-outline-gold mt-4 rounded-xl px-5 py-2.5 text-sm"
            >
              Send another message
            </button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[0.78rem] font-semibold text-mist-300">
                Your name *
              </label>
              <input
                className="input-premium"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Rafiq Hasan"
              />
              {errors.name && <p className="mt-1 text-[0.76rem] text-danger">{errors.name}</p>}
            </div>
            <div>
              <label className="mb-1.5 block text-[0.78rem] font-semibold text-mist-300">
                Email
              </label>
              <input
                className="input-premium"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="you@example.com"
              />
              {errors.email && <p className="mt-1 text-[0.76rem] text-danger">{errors.email}</p>}
            </div>
            <div>
              <label className="mb-1.5 block text-[0.78rem] font-semibold text-mist-300">
                Mobile number
              </label>
              <input
                className="input-premium"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="01712345678"
                inputMode="numeric"
              />
              {errors.phone && <p className="mt-1 text-[0.76rem] text-danger">{errors.phone}</p>}
            </div>
            <div>
              <label className="mb-1.5 block text-[0.78rem] font-semibold text-mist-300">
                Subject *
              </label>
              <input
                className="input-premium"
                value={form.subject}
                onChange={(e) => set("subject", e.target.value)}
                placeholder="Order issue, product question…"
              />
              {errors.subject && (
                <p className="mt-1 text-[0.76rem] text-danger">{errors.subject}</p>
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-[0.78rem] font-semibold text-mist-300">
                Message *
              </label>
              <textarea
                className="input-premium min-h-36 resize-y"
                value={form.message}
                onChange={(e) => set("message", e.target.value)}
                placeholder="How can we help?"
              />
              {errors.message && (
                <p className="mt-1 text-[0.76rem] text-danger">{errors.message}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={busy}
              className="btn-gold flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm sm:col-span-2"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {busy ? "Sending…" : "Send Message"}
            </button>
          </form>
        )}
      </div>

      {/* Contact details */}
      <aside className="space-y-4">
        <div className="rounded-3xl border border-gold-500/20 bg-gradient-to-b from-ink-800 to-ink-900 p-6">
          <h3 className="font-display text-lg font-semibold text-gold-gradient">Reach us directly</h3>
          <ul className="mt-4 space-y-4 text-[0.88rem]">
            <li className="flex gap-3">
              <Phone size={16} className="mt-0.5 shrink-0 text-gold-500" />
              <div>
                <p className="text-[0.72rem] uppercase tracking-wide text-mist-600">Phone</p>
                <a href={`tel:${contact.phone.replace(/\s/g, "")}`} className="text-mist-200 hover:text-gold-300">
                  {contact.phone}
                </a>
              </div>
            </li>
            <li className="flex gap-3">
              <Mail size={16} className="mt-0.5 shrink-0 text-gold-500" />
              <div>
                <p className="text-[0.72rem] uppercase tracking-wide text-mist-600">Email</p>
                <a href={`mailto:${contact.email}`} className="break-all text-mist-200 hover:text-gold-300">
                  {contact.email}
                </a>
              </div>
            </li>
            <li className="flex gap-3">
              <MapPin size={16} className="mt-0.5 shrink-0 text-gold-500" />
              <div>
                <p className="text-[0.72rem] uppercase tracking-wide text-mist-600">Address</p>
                <p className="text-mist-200">{contact.address}</p>
              </div>
            </li>
            <li className="flex gap-3">
              <Clock size={16} className="mt-0.5 shrink-0 text-gold-500" />
              <div>
                <p className="text-[0.72rem] uppercase tracking-wide text-mist-600">Hours</p>
                <p className="text-mist-200">{contact.hours}</p>
              </div>
            </li>
          </ul>
        </div>

        <div className="rounded-3xl border border-white/[0.08] bg-white/[0.02] p-6">
          <h3 className="text-[0.78rem] font-bold uppercase tracking-[0.18em] text-gold-400">
            Quick help
          </h3>
          <ul className="mt-3 space-y-2.5 text-[0.85rem]">
            <li>
              <a href="/track-order" className="link-gold text-mist-300">
                Track your order
              </a>
            </li>
            <li>
              <a href="/p/returns-refunds" className="link-gold text-mist-300">
                Returns &amp; refunds
              </a>
            </li>
            <li>
              <a href="/p/shipping-delivery" className="link-gold text-mist-300">
                Shipping &amp; delivery
              </a>
            </li>
            <li>
              <a href="/p/warranty" className="link-gold text-mist-300">
                Warranty policy
              </a>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
