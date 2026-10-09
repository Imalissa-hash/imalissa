"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { useStore } from "@/components/providers/AppProviders";
import { isBdPhone, isEmail, isStrongPassword, normalizePhone } from "@/lib/validation";
import { Logo } from "@/components/ui/Logo";

type Mode = "login" | "register";

/** After step 1 (password) the server asks for the emailed 6-digit code. */
interface OtpChallenge {
  purpose: Mode;
  email: string;
  delivery: "email" | "dev";
}

/**
 * Shared login / register form.
 *  - Server does the real validation & auth; this mirrors the basic rules
 *    so users get instant feedback without a round trip.
 *  - On success we refresh global state (user + merged guest cart) and
 *    continue to ?next= or the account home.
 */
export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const { setUser, refreshCart, refreshWishlist, toast } = useStore();

  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // OTP verification step (signup & login both require the emailed code).
  const [otp, setOtp] = useState<OtpChallenge | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const [form, setForm] = useState({
    identifier: "",
    name: "",
    phone: "",
    email: "",
    password: "",
    confirm: "",
  });

  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const safeNext = params.get("next");
  const nextPath =
    safeNext && safeNext.startsWith("/") && !safeNext.startsWith("//") ? safeNext : "/account";

  function validate(): boolean {
    const errs: Record<string, string> = {};

    if (mode === "login") {
      const id = form.identifier.trim();
      if (!id) errs.identifier = "Enter your email or phone number";
      else if (!(isEmail(id) || isBdPhone(normalizePhone(id)) || id.length >= 3)) {
        errs.identifier = "Enter a valid email or phone number";
      }
      if (!form.password) errs.password = "Enter your password";
    } else {
      if (form.name.trim().length < 2) errs.name = "Please enter your full name";
      if (!isBdPhone(normalizePhone(form.phone))) {
        errs.phone = "Enter a valid BD mobile (e.g. 01712345678)";
      }
      // Email is required: the signup verification code is sent here.
      if (!form.email.trim()) errs.email = "Email is required — we send the verification code here";
      else if (!isEmail(form.email)) errs.email = "Enter a valid email";
      if (!isStrongPassword(form.password)) {
        errs.password = "Use 8+ characters with letters and numbers";
      }
      if (form.confirm !== form.password) errs.confirm = "Passwords do not match";
    }

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate() || busy) return;

    setBusy(true);
    try {
      const url = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body =
        mode === "login"
          ? { identifier: form.identifier.trim(), password: form.password }
          : {
              name: form.name.trim(),
              phone: normalizePhone(form.phone),
              email: form.email.trim(),
              password: form.password,
            };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({ ok: false, message: "Invalid server response" }));

      if (!json.ok) {
        setError(json.message ?? "Something went wrong. Please try again.");
        return;
      }

      // Step 1 done (credentials accepted) — now the emailed code is required.
      if (json.data?.otpRequired) {
        setOtp({
          purpose: mode,
          email: json.data.email,
          delivery: json.data.delivery ?? "email",
        });
        setDevCode(json.data.devCode ?? null);
        setOtpCode("");
        setError(null);
        setFieldErrors({});
        return;
      }

      setUser(json.data ?? null);
      toast(mode === "login" ? "Welcome back!" : "Account created — welcome!", "success");
      // Redirect FIRST so nobody waits on the cart / wishlist refresh — the
      // badges catch up in the background once the data lands.
      router.push(nextPath);
      router.refresh();
      void Promise.all([refreshCart(), refreshWishlist()]);
    } catch {
      setError("Network error — please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const isLogin = mode === "login";

  /** Step 2: confirm the emailed code → server creates session → done. */
  async function submitOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!otp || busy) return;
    const code = otpCode.replace(/\D/g, "");
    if (code.length !== 6) {
      setError("Enter the 6-digit code from your email");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: otp.purpose, email: otp.email, code }),
      });
      const json = await res.json().catch(() => ({ ok: false, message: "Invalid server response" }));
      if (!json.ok) {
        setError(json.message ?? "That code is not correct. Please try again.");
        return;
      }

      setUser(json.data ?? null);
      toast(otp.purpose === "login" ? "Welcome back!" : "Account created — welcome!", "success");
      router.push(nextPath);
      router.refresh();
      void Promise.all([refreshCart(), refreshWishlist()]);
    } catch {
      setError("Network error — please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  /** Ask the server to issue a fresh code (rate-limited server-side). */
  async function resendOtp() {
    if (!otp || resending) return;
    setError(null);
    setResending(true);
    try {
      const res = await fetch("/api/auth/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: otp.purpose, email: otp.email }),
      });
      const json = await res.json().catch(() => ({ ok: false }));
      if (!json.ok) {
        setError(json.message ?? "Could not send a new code. Please try again.");
        return;
      }
      if (json.data?.devCode) setDevCode(json.data.devCode);
      toast("A new code has been sent to your email", "success");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[78vh] max-w-6xl items-center px-4 py-12 sm:px-6 lg:px-8">
      {/* Left: brand panel */}
      <motion.aside
        initial={{ opacity: 0, x: -24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
        className="hidden w-[42%] shrink-0 flex-col justify-between rounded-3xl border border-gold-500/20 bg-gradient-to-br from-ink-800 via-ink-900 to-ink-950 p-10 lg:flex"
      >
        <Logo />
        <div>
          <h2 className="font-display text-3xl font-bold leading-tight text-mist-50">
            The Imalissa{" "}
            <span className="text-gold-gradient">Membership</span>
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-mist-400">
            Save your addresses, track every order in real time, sync your wishlist
            across devices and get early access to member-only offers.
          </p>
          <ul className="mt-8 space-y-3 text-[0.86rem] text-mist-300">
            {[
              "Order history & one-tap reorder",
              "Live order tracking with status timeline",
              "Exclusive coupons for members",
              "Faster checkout with saved addresses",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2.5">
                <ShieldCheck size={15} className="shrink-0 text-gold-500" /> {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[0.76rem] text-mist-600">
          Your data is encrypted and never shared with third parties.
        </p>
      </motion.aside>

      {/* Right: form */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.08 }}
        className="w-full lg:ml-10 lg:w-[58%]"
      >
        <div className="mx-auto max-w-md rounded-3xl border border-white/[0.08] bg-white/[0.02] p-7 shadow-lift sm:p-9">
          <div className="mb-7 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-gold-500/25 bg-gold-500/[0.07] text-gold-400">
              <LockKeyhole size={22} />
            </div>
            <h1 className="font-display text-2xl font-bold text-mist-50">
              {otp ? "Check your email" : isLogin ? "Welcome back" : "Create your account"}
            </h1>
            <p className="mt-1.5 text-sm text-mist-500">
              {otp
                ? "Enter the verification code we just sent you"
                : isLogin
                  ? "Sign in to continue to your account"
                  : "Join Imalissa in a few seconds"}
            </p>
          </div>

          {error && (
            <div className="mb-5 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-[0.84rem] text-danger">
              {error}
            </div>
          )}

          {otp ? (
            <form onSubmit={submitOtp} noValidate className="space-y-4">
              <div className="rounded-xl border border-gold-500/25 bg-gold-500/[0.06] px-4 py-3 text-[0.84rem] leading-relaxed text-gold-200">
                We sent a 6-digit code to{" "}
                <strong className="break-all text-gold-300">{otp.email}</strong>. It expires in 10
                minutes — check your spam folder if you don't see it.
              </div>

              {devCode && (
                <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-[0.84rem] leading-relaxed text-amber-200">
                  <strong className="font-semibold">Development mode</strong> — SMTP email is not
                  configured on this server, so <strong>no email was sent</strong>. Your code is{" "}
                  <span className="font-mono text-base font-bold tracking-[0.3em] text-amber-100">
                    {devCode}
                  </span>
                  .
                </div>
              )}

              <Field label="Verification code" error={fieldErrors.code}>
                <input
                  className="input-premium text-center font-mono text-xl tracking-[0.45em]"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  autoFocus
                />
              </Field>

              <button
                type="submit"
                disabled={busy}
                className="btn-gold flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm"
              >
                {busy && <Loader2 size={16} className="animate-spin" />}
                Verify &amp; Continue
              </button>

              <div className="flex items-center justify-between text-[0.8rem]">
                <button
                  type="button"
                  onClick={resendOtp}
                  disabled={resending}
                  className="text-gold-400 transition hover:text-gold-300 disabled:opacity-50"
                >
                  {resending ? "Sending…" : "Send a new code"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOtp(null);
                    setError(null);
                  }}
                  className="text-mist-400 transition hover:text-mist-200"
                >
                  ← Back to {isLogin ? "sign in" : "sign up"}
                </button>
              </div>
            </form>
          ) : (
          <form onSubmit={submit} noValidate className="space-y-4">
            {!isLogin && (
              <Field label="Full name" error={fieldErrors.name}>
                <input
                  className="input-premium"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="e.g. Rafiq Hasan"
                  autoComplete="name"
                />
              </Field>
            )}

            {isLogin ? (
              <Field label="Email or mobile number" error={fieldErrors.identifier}>
                <input
                  className="input-premium"
                  value={form.identifier}
                  onChange={(e) => set("identifier", e.target.value)}
                  placeholder="you@example.com or 017XXXXXXXX"
                  autoComplete="username"
                />
              </Field>
            ) : (
              <Field label="Mobile number" error={fieldErrors.phone}>
                <input
                  className="input-premium"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="01712345678"
                  inputMode="numeric"
                  autoComplete="tel"
                />
              </Field>
            )}

            {!isLogin && (
              <Field label="Email" error={fieldErrors.email}>
                <input
                  className="input-premium"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </Field>
            )}

            <Field label="Password" error={fieldErrors.password}>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  className="input-premium pr-11"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  placeholder={isLogin ? "Your password" : "8+ characters, letters & numbers"}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-mist-500 transition hover:text-gold-400"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>

            {!isLogin && (
              <Field label="Confirm password" error={fieldErrors.confirm}>
                <input
                  type={showPassword ? "text" : "password"}
                  className="input-premium"
                  value={form.confirm}
                  onChange={(e) => set("confirm", e.target.value)}
                  placeholder="Repeat your password"
                  autoComplete="new-password"
                />
              </Field>
            )}

            {isLogin && (
              <div className="flex items-center justify-between text-[0.8rem]">
                <label className="flex cursor-pointer items-center gap-2 text-mist-400">
                  <input type="checkbox" className="accent-gold-500" defaultChecked />
                  Remember me
                </label>
                <Link href="/auth/forgot" className="text-gold-400 transition hover:text-gold-300">
                  Forgot password?
                </Link>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="btn-gold flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm"
            >
              {busy && <Loader2 size={16} className="animate-spin" />}
              {isLogin ? "Sign In" : "Create Account"}
            </button>
          </form>
          )}

          {!otp && (
          <p className="mt-6 text-center text-[0.86rem] text-mist-500">
            {isLogin ? "New to Imalissa?" : "Already have an account?"}{" "}
            <Link
              href={
                isLogin
                  ? `/auth/register${nextPath !== "/account" ? `?next=${encodeURIComponent(nextPath)}` : ""}`
                  : `/auth/login${nextPath !== "/account" ? `?next=${encodeURIComponent(nextPath)}` : ""}`
              }
              className="font-semibold text-gold-400 transition hover:text-gold-300"
            >
              {isLogin ? "Create an account" : "Sign in"}
            </Link>
          </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[0.78rem] font-semibold text-mist-300">{label}</label>
      {children}
      {error && <p className="mt-1.5 text-[0.76rem] text-danger">{error}</p>}
    </div>
  );
}
