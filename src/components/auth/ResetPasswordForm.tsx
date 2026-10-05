"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { isEmail, isStrongPassword } from "@/lib/validation";

/**
 * Step 2 of the customer password-reset flow — the emailed link lands here as
 * /auth/reset?e=<email>&t=<token>. It POSTs /api/auth/reset which burns the
 * single-use token, stores the new hash and revokes every session for that
 * account.
 *
 * Missing / malformed link → an explicit invalid state with a way to request a
 * fresh link, never a form that cannot succeed.
 */
export function ResetPasswordForm({ email, token }: { email: string; token: string }) {
  const [form, setForm] = useState({ email, password: "", confirm: "" });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const linkBroken = !token || !email;

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!isEmail(form.email.trim())) errs.email = "Enter a valid email address";
    if (!isStrongPassword(form.password)) {
      errs.password = "Use 8+ characters with letters and numbers";
    }
    if (form.confirm !== form.password) errs.confirm = "Passwords do not match";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (busy || !validate()) return;

    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email.trim(),
          token,
          password: form.password,
        }),
      });
      const json = await res.json().catch(() => ({ ok: false, message: "Invalid server response" }));
      if (!json.ok) {
        setError(json.message ?? "Something went wrong. Please try again.");
        return;
      }
      setDone(json.data?.message ?? "Password updated.");
    } catch {
      setError("Network error — please try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="mx-auto max-w-md px-4 py-16 sm:py-20"
    >
      <div className="rounded-3xl border border-white/[0.08] bg-white/[0.02] p-7 shadow-lift sm:p-9">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-gold-500/25 bg-gold-500/[0.07] text-gold-400">
            <KeyRound size={22} />
          </div>
          <h1 className="font-display text-2xl font-bold text-mist-50">Set a new password</h1>
          <p className="mt-1.5 text-sm text-mist-500">
            This link works once and expires 15 minutes after it was sent
          </p>
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-[0.84rem] text-danger">
            {error}
          </div>
        )}

        {linkBroken ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-[0.84rem] leading-relaxed text-danger">
              This reset link is incomplete or invalid. Please request a new one — links expire
              after 15 minutes and can only be used once.
            </div>
            <Link
              href="/auth/forgot"
              className="btn-gold flex w-full items-center justify-center rounded-xl py-3.5 text-sm"
            >
              Request a new link
            </Link>
          </div>
        ) : done ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-gold-500/25 bg-gold-500/[0.06] px-4 py-3 text-[0.84rem] leading-relaxed text-gold-200">
              {done} For safety, you have been signed out on every device.
            </div>
            <Link
              href="/auth/login"
              className="btn-gold flex w-full items-center justify-center rounded-xl py-3.5 text-sm"
            >
              Sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[0.78rem] font-semibold text-mist-300">
                Email address
              </label>
              <input
                className="input-premium"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                inputMode="email"
              />
              {fieldErrors.email && (
                <p className="mt-1.5 text-[0.76rem] text-danger">{fieldErrors.email}</p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-[0.78rem] font-semibold text-mist-300">
                New password
              </label>
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  className="input-premium pr-11"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  placeholder="8+ characters, letters and numbers"
                  autoComplete="new-password"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-mist-500 transition hover:text-gold-400"
                >
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="mt-1.5 text-[0.76rem] text-danger">{fieldErrors.password}</p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-[0.78rem] font-semibold text-mist-300">
                Confirm new password
              </label>
              <input
                type={show ? "text" : "password"}
                className="input-premium"
                value={form.confirm}
                onChange={(e) => set("confirm", e.target.value)}
                placeholder="Repeat the new password"
                autoComplete="new-password"
              />
              {fieldErrors.confirm && (
                <p className="mt-1.5 text-[0.76rem] text-danger">{fieldErrors.confirm}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={busy}
              className="btn-gold flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm"
            >
              {busy && <Loader2 size={16} className="animate-spin" />}
              Save new password
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-[0.86rem] text-mist-500">
          Link expired?{" "}
          <Link href="/auth/forgot" className="font-semibold text-gold-400 transition hover:text-gold-300">
            Request a new one
          </Link>
        </p>
      </div>
    </motion.div>
  );
}
