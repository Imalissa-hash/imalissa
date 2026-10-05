"use client";

import Link from "next/link";
import { useState } from "react";
import { KeyRound, Loader2, MailCheck, ShieldCheck } from "lucide-react";

/**
 * Step 1 of the admin password-reset flow — POSTs /api/admin/auth/forgot.
 * The answer is identical for known and unknown addresses (no enumeration),
 * and a `devLink` (OTP_DEV_MODE, no SMTP) is shown as "no email was sent".
 */
export function AdminForgotClient() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ message: string; devLink?: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);

    const value = email.trim();
    if (!value) {
      setFieldError("Enter your admin email");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setFieldError("Enter a valid email address");
      return;
    }
    setFieldError(null);

    setBusy(true);
    try {
      const res = await fetch("/api/admin/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      const json = await res.json().catch(() => ({ ok: false, message: "Invalid server response" }));
      if (!json.ok) {
        setError(json.message ?? "Something went wrong. Please try again.");
        return;
      }
      setSent({ message: json.data?.message, devLink: json.data?.devLink });
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
              {sent ? <MailCheck size={24} /> : <KeyRound size={24} />}
            </div>
            <h1 className="font-display text-2xl font-bold text-mist-50">
              {sent ? "Check your email" : "Reset admin password"}
            </h1>
            <p className="mt-1 text-sm text-mist-500">
              {sent
                ? "If that admin account exists, a reset link is on its way"
                : "We will email you a single-use link (valid 15 minutes)"}
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-[0.84rem] text-danger">
              {error}
            </div>
          )}

          {sent ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-gold-500/25 bg-gold-500/[0.06] px-4 py-3 text-[0.84rem] leading-relaxed text-gold-200">
                {sent.message}
              </div>

              {sent.devLink && (
                <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-[0.84rem] leading-relaxed text-amber-200">
                  <strong className="font-semibold">Development mode</strong> — SMTP email is not
                  configured, so <strong>no email was sent</strong>. Open this link:{" "}
                  <a
                    href={sent.devLink}
                    className="break-all font-semibold underline decoration-amber-300/60 hover:text-amber-100"
                  >
                    {sent.devLink}
                  </a>
                </div>
              )}

              <Link
                href="/admin/login"
                className="btn-gold flex w-full items-center justify-center rounded-xl py-3 text-sm"
              >
                Back to sign in
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
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@imalissa.com"
                  autoComplete="username"
                  inputMode="email"
                  autoFocus
                />
                {fieldError && <p className="mt-1.5 text-[0.76rem] text-danger">{fieldError}</p>}
              </div>

              <button
                type="submit"
                disabled={busy}
                className="btn-gold flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm"
              >
                {busy && <Loader2 size={16} className="animate-spin" />}
                Send reset link
              </button>
            </form>
          )}

          <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-[0.76rem] leading-relaxed text-mist-600">
            <ShieldCheck size={13} className="shrink-0 text-gold-500/70" />
            The link is single-use and signs out every admin session when used.
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
