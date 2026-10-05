"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";

/** Admin sign-in card. */
export function AdminLoginClient() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const json = await res.json().catch(() => ({ ok: false }));
      if (json.ok) {
        router.push("/admin");
        router.refresh();
      } else {
        setError(json.message ?? "Sign-in failed");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-3xl border border-gold-500/20 bg-gradient-to-b from-ink-800 to-ink-900 p-8 shadow-lift">
          <div className="mb-7 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-gold-500/30 bg-gold-500/[0.08] text-gold-400">
              <ShieldCheck size={24} />
            </div>
            <h1 className="font-display text-2xl font-bold text-mist-50">Imalissa Admin</h1>
            <p className="mt-1 text-sm text-mist-500">Restricted area — authorised staff only</p>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-[0.84rem] text-danger">
              {error}
            </div>
          )}

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
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[0.78rem] font-semibold text-mist-300">
                Password
              </label>
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  className="input-premium pr-11"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
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
            </div>

            <button
              type="submit"
              disabled={busy}
              className="btn-gold flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm"
            >
              {busy && <Loader2 size={16} className="animate-spin" />}
              Sign in
            </button>
          </form>

          <div className="mt-3 text-center">
            <Link
              href="/admin/forgot"
              className="text-[0.8rem] text-gold-400 transition hover:text-gold-300"
            >
              Forgot password?
            </Link>
          </div>

          <p className="mt-5 text-center text-[0.76rem] leading-relaxed text-mist-600">
            Sessions are logged and expire automatically. Customer accounts cannot access this
            area.
          </p>
        </div>

        <a
          href="/"
          className="mt-4 block text-center text-[0.8rem] text-mist-500 transition hover:text-gold-400"
        >
          ← Back to store
        </a>
      </div>
    </div>
  );
}
