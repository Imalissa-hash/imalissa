"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { KeyRound, Loader2, MailCheck } from "lucide-react";
import { isEmail } from "@/lib/validation";

/**
 * Step 1 of the customer password-reset flow — asks for the account email and
 * POSTs /api/auth/forgot. The server answers with the same payload whether or
 * not the address exists (no account enumeration), so success is shown as
 * "if an account exists…" exactly like the API wording.
 *
 * When SMTP is not configured the API returns `devLink` (OTP_DEV_MODE) and we
 * surface it in an amber box that says no email was sent — never a fake claim.
 */
export function ForgotPasswordForm() {
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
      setFieldError("Enter the email you signed up with");
      return;
    }
    if (!isEmail(value)) {
      setFieldError("Enter a valid email address");
      return;
    }
    setFieldError(null);

    setBusy(true);
    try {
      const res = await fetch("/api/auth/forgot", {
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
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="mx-auto max-w-md px-4 py-16 sm:py-20"
    >
      <div className="rounded-3xl border border-white/[0.08] bg-white/[0.02] p-7 shadow-lift sm:p-9">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-gold-500/25 bg-gold-500/[0.07] text-gold-400">
            {sent ? <MailCheck size={22} /> : <KeyRound size={22} />}
          </div>
          <h1 className="font-display text-2xl font-bold text-mist-50">
            {sent ? "Check your email" : "Forgot your password?"}
          </h1>
          <p className="mt-1.5 text-sm text-mist-500">
            {sent
              ? "If that email is registered, a reset link is on its way"
              : "Enter your account email and we will send you a reset link"}
          </p>
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-[0.84rem] text-danger">
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
                configured on this server, so <strong>no email was sent</strong>. Open the link
                below to continue:{" "}
                <Link
                  href={sent.devLink}
                  className="break-all font-semibold underline decoration-amber-300/60 hover:text-amber-100"
                >
                  {sent.devLink}
                </Link>
              </div>
            )}

            <Link
              href="/auth/login"
              className="btn-gold flex w-full items-center justify-center rounded-xl py-3.5 text-sm"
            >
              Back to sign in
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                inputMode="email"
                autoFocus
              />
              {fieldError && <p className="mt-1.5 text-[0.76rem] text-danger">{fieldError}</p>}
            </div>

            <button
              type="submit"
              disabled={busy}
              className="btn-gold flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm"
            >
              {busy && <Loader2 size={16} className="animate-spin" />}
              Send reset link
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-[0.86rem] text-mist-500">
          Remembered it?{" "}
          <Link href="/auth/login" className="font-semibold text-gold-400 transition hover:text-gold-300">
            Sign in
          </Link>
        </p>
      </div>
    </motion.div>
  );
}
