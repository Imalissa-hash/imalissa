/**
 * Minimal, dependency-free validation helpers shared by client forms and API routes.
 * Kept intentionally small: every rule here maps to a user-facing message.
 */

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export function isBdPhone(value: string): boolean {
  return /^01[3-9]\d{8}$/.test(value.replace(/[\s-]/g, ""));
}

export function normalizePhone(value: string): string {
  let v = value.replace(/[\s\-()]/g, "");
  if (v.startsWith("+880")) v = "0" + v.slice(4);
  return v;
}

export function minLength(value: string, n: number): boolean {
  return value.trim().length >= n;
}

export function maxLength(value: string, n: number): boolean {
  return value.trim().length <= n;
}

/** Password strength: 8+ chars with at least one letter and one number. */
export function isStrongPassword(value: string): boolean {
  return value.length >= 8 && /[a-zA-Z]/.test(value) && /\d/.test(value);
}

export function passwordStrength(value: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  let score = 0;
  if (value.length >= 8) score++;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
  if (/\d/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;
  const labels = ["Too weak", "Weak", "Fair", "Good", "Strong"];
  return { score: score as 0 | 1 | 2 | 3 | 4, label: labels[score] };
}

export function samePassword(a: string, b: string): boolean {
  return a === b && a.length > 0;
}

/** Check whether a Bangladeshi postal code is valid (4 digits). */
export function isPostalCode(value: string): boolean {
  return /^\d{4}$/.test(value.trim());
}

export function validateCheckout(input: Record<string, unknown>): Result<true> {
  const name = String(input.fullName ?? "").trim();
  if (!minLength(name, 3)) return { ok: false, error: "Please enter your full name." };
  const phone = normalizePhone(String(input.phone ?? ""));
  if (!isBdPhone(phone)) return { ok: false, error: "Enter a valid Bangladeshi mobile number (e.g. 017XXXXXXXX)." };
  const email = String(input.email ?? "").trim();
  if (email && !isEmail(email)) return { ok: false, error: "Enter a valid email address." };
  const area = String(input.area ?? "").trim();
  if (!minLength(area, 2)) return { ok: false, error: "Please enter your area / thana." };
  const address = String(input.address ?? "").trim();
  if (!minLength(address, 6)) return { ok: false, error: "Please enter a detailed address." };
  return { ok: true, value: true };
}
