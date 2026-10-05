"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { isStrongPassword } from "@/lib/validation";

/**
 * Step 2 of the admin password-reset flow — the emailed link lands here as
 * /admin/reset?e=<email>&t=<token>. POSTs /api/admin/auth/reset, which burns
 * the token, stores the new hash and revokes every admin session.
 */
export function AdminResetClient({ email, token }: { email: string; token: string }) {
  const router = useRouter();
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errs.email = "Enter a valid email address";
    }
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
      const res = await fetch("/api/admin/auth/reset", {
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
      // Every admin session was revoked, including this browser's.
      setTimeout(() => {
        router.push("/admin/login");
        router.refresh();
      }, 2500);
    } catch {
      setError("Network error — please try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-3xl border border-gold-500/20 bg-gradient-to-b from-ink-800 to-ink-900 p-8 shadow-lift">
          <div className="mb-7 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-gold-500/30 bg-gold-500/[0.08] text-gold-400">
              <KeyRound size={24} />
            </div>
            <h1 className="font-display text-2xl font-bold text-mist-50">Set a new password</h1>
            <p className="mt-1 text-sm text-mist-500">
              This link works once and expires 15 minutes after it was sent
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-[0.84rem] text-danger">
              {error}
            </div>
          )}

          {linkBroken ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-[0.84rem] leading-relaxed text-danger">
                This reset link is incomplete or invalid. Request a new one — links expire after
                15 minutes and can only be used once.
              </div>
              <Link
                href="/admin/forgot"
                className="btn-gold flex w-full items-center justify-center rounded-xl py-3 text-sm"
              >
                Request a new link
              </Link>
            </div>
          ) : done ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-gold-500/25 bg-gold-500/[0.06] px-4 py-3 text-[0.84rem] leading-relaxed text-gold-200">
                {done} Taking you to the sign-in page…
              </div>
              <Link
                href="/admin/login"
                className="btn-gold flex w-full items-center justify-center rounded-xl py-3 text-sm"
              >
                Go to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[0.78rem] font-semibold text-mist-300">
                  Email
                </label>
                <input
                  className="input-premium"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="admin@imalissa.com"
                  autoComplete="username"
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
                className="btn-gold flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm"
              >
                {busy && <Loader2 size={16} className="animate-spin" />}
                Save new password
              </button>
            </form>
          )}

          <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-[0.76rem] leading-relaxed text-mist-600">
            <ShieldCheck size={13} className="shrink-0 text-gold-500/70" />
            Saving signs out every admin session for this account.
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between text-[0.8rem]">
          <Link href="/admin/login" className="text-mist-500 transition hover:text-gold-400">
            ← Sign in
          </Link>
          <Link href="/" className="text-mist-500 transition hover:text-gold-400">
            Back to store
          </Link>
        </div>
      </div>
    </div>
  );
}
