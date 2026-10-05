"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck, UserRound } from "lucide-react";
import { useStore } from "@/components/providers/AppProviders";
import { AccountPanel } from "@/components/account/AccountShell";
import { isBdPhone, isEmail, isStrongPassword, normalizePhone, passwordStrength } from "@/lib/validation";

interface Profile {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

/** Profile details + password change. */
export function SettingsClient() {
  const { toast, user, setUser } = useStore();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [showPw, setShowPw] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/auth/me");
      const json = await res.json().catch(() => ({ ok: false }));
      if (json.ok && json.data) setProfile(json.data as Profile);
    })();
  }, []);

  const saveProfile = async () => {
    if (!profile) return;
    setSavingProfile(true);
    try {
      const body: Record<string, string> = { name: profile.name.trim() };
      if (profile.phone) body.phone = normalizePhone(profile.phone);
      body.email = profile.email?.trim() ?? "";

      if (body.email && !isEmail(body.email)) {
        toast("Enter a valid email address", "error");
        return;
      }
      if (body.phone && !isBdPhone(body.phone)) {
        toast("Enter a valid BD mobile number", "error");
        return;
      }

      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({ ok: false }));
      if (json.ok) {
        setProfile(json.data as Profile);
        setUser({ ...user!, ...(json.data as Profile) });
        toast("Profile updated", "success");
      } else {
        toast(json.message ?? "Could not update profile", "error");
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async () => {
    setPwError(null);
    if (!pw.current) return setPwError("Enter your current password");
    if (!isStrongPassword(pw.next)) {
      return setPwError("New password needs 8+ characters with letters and numbers");
    }
    if (pw.next !== pw.confirm) return setPwError("New passwords do not match");

    setSavingPw(true);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }),
      });
      const json = await res.json().catch(() => ({ ok: false }));
      if (json.ok) {
        setPw({ current: "", next: "", confirm: "" });
        toast("Password changed — other sessions signed out", "success");
      } else {
        setPwError(json.message ?? "Could not change password");
      }
    } finally {
      setSavingPw(false);
    }
  };

  const strength = passwordStrength(pw.next);

  if (!profile) {
    return (
      <div className="space-y-5">
        <div className="skeleton h-72 rounded-2xl" />
        <div className="skeleton h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <AccountPanel
        title="Profile"
        subtitle="How we address you and reach you"
        action={
          <button
            onClick={saveProfile}
            disabled={savingProfile}
            className="btn-gold flex items-center gap-2 rounded-xl px-5 py-2.5 text-[0.84rem]"
          >
            {savingProfile && <Loader2 size={14} className="animate-spin" />}
            Save changes
          </button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-[0.78rem] font-semibold text-mist-300">
              <UserRound size={13} className="text-gold-500" /> Full name
            </label>
            <input
              className="input-premium"
              value={profile.name}
              onChange={(e) => setProfile((p) => (p ? { ...p, name: e.target.value } : p))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[0.78rem] font-semibold text-mist-300">
              Mobile number
            </label>
            <input
              className="input-premium"
              value={profile.phone ?? ""}
              onChange={(e) => setProfile((p) => (p ? { ...p, phone: e.target.value } : p))}
              inputMode="numeric"
              placeholder="01712345678"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-[0.78rem] font-semibold text-mist-300">
              Email address
            </label>
            <input
              className="input-premium"
              value={profile.email ?? ""}
              onChange={(e) => setProfile((p) => (p ? { ...p, email: e.target.value } : p))}
              placeholder="you@example.com"
            />
            <p className="mt-1.5 text-[0.74rem] text-mist-600">
              Used for order updates — leave blank if you prefer SMS only.
            </p>
          </div>
        </div>
      </AccountPanel>

      <AccountPanel
        title="Change Password"
        subtitle="Changing your password signs out every other device"
      >
        <div className="grid gap-4 sm:max-w-md">
          <div>
            <label className="mb-1.5 block text-[0.78rem] font-semibold text-mist-300">
              Current password
            </label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                className="input-premium pr-11"
                value={pw.current}
                onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                aria-label={showPw ? "Hide passwords" : "Show passwords"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-mist-500 transition hover:text-gold-400"
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[0.78rem] font-semibold text-mist-300">
              New password
            </label>
            <input
              type={showPw ? "text" : "password"}
              className="input-premium"
              value={pw.next}
              onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
              autoComplete="new-password"
            />
            {pw.next && (
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full transition-all ${
                      strength.score <= 1
                        ? "bg-danger"
                        : strength.score === 2
                          ? "bg-amber-500"
                          : "bg-success"
                    }`}
                    style={{ width: `${(strength.score / 4) * 100}%` }}
                  />
                </div>
                <span className="text-[0.72rem] text-mist-500">{strength.label}</span>
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-[0.78rem] font-semibold text-mist-300">
              Confirm new password
            </label>
            <input
              type={showPw ? "text" : "password"}
              className="input-premium"
              value={pw.confirm}
              onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
              autoComplete="new-password"
            />
          </div>

          {pwError && (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[0.8rem] text-danger">
              {pwError}
            </p>
          )}

          <button
            onClick={changePassword}
            disabled={savingPw}
            className="btn-outline-gold flex w-fit items-center gap-2 rounded-xl px-5 py-2.5 text-[0.84rem]"
          >
            {savingPw ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
            Update password
          </button>
        </div>
      </AccountPanel>

      <AccountPanel title="Security" subtitle="How your account is protected">
        <ul className="space-y-2.5 text-[0.85rem] text-mist-400">
          {[
            "Passwords are stored with bcrypt hashing (never in plain text).",
            "Sessions expire automatically and can be revoked by changing your password.",
            "Payment details are never stored on our servers.",
          ].map((t) => (
            <li key={t} className="flex items-start gap-2.5">
              <ShieldCheck size={15} className="mt-0.5 shrink-0 text-gold-500" /> {t}
            </li>
          ))}
        </ul>
      </AccountPanel>
    </div>
  );
}
