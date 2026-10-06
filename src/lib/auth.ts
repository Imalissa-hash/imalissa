import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { cookieSecure } from "./utils";

/**
 * Customer authentication.
 * - Passwords: bcrypt — cost 10 for new hashes (see COST below)
 * - Sessions: 32-byte random token, SHA-256 hashed in DB, raw value in an
 *   httpOnly + SameSite=Lax cookie. Knowing the cookie gives no DB access
 *   without the stored hash matching, and DB access gives no cookie without
 *   the raw token.
 */

export const SESSION_COOKIE = "imalissa_session";
export const SESSION_DAYS = 30;

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * bcrypt cost for NEW hashes.
 *
 * Cost 12 in pure-JS bcryptjs costs ~2.8 s per verify on a desktop and ~5 s
 * on the Render free instance — that one compare was most of the login time
 * (measured live: POST /api/admin/auth/login 5–7 s warm). Cost 10 is the
 * OWASP-recommended minimum for bcrypt and is 4× cheaper. Stored cost-12
 * hashes still verify (the cost lives inside the hash) and are rewritten to
 * this setting on the owner's next successful login via `needsRehash`.
 */
const COST = 10;

export async function hashPassword(password: string): Promise<string> {
  const bcrypt = await import("bcryptjs");
  return bcrypt.hash(password, COST);
}

/**
 * True when `hash` is a bcrypt hash slower than COST — i.e. worth re-hashing
 * now that the plaintext is in hand. Only call after a successful verify:
 * replacing the row discards the previous hash.
 */
export function needsRehash(hash: string): boolean {
  const m = /^\$2[aby]\$(\d{2})\$/.exec(hash);
  return m ? Number(m[1]) > COST : false;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    const bcrypt = await import("bcryptjs");
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
}

async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Secure only when the site is actually served over HTTPS. Gating on
    // NODE_ENV broke every cookie when running production over plain HTTP
    // (localhost / LAN IP) — browsers reject Secure cookies on http://192.168.x.x.
    secure: cookieSecure(),
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Create a session for a user and set the cookie. */
export async function startSession(userId: string, ip?: string, userAgent?: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      tokenHash: sha256(token),
      userId,
      ip: ip ?? null,
      userAgent: userAgent?.slice(0, 255) ?? null,
      expiresAt,
    },
  });

  await setSessionCookie(token, expiresAt);
}

/** Resolve the logged-in customer (or null). Safe to call anywhere server-side. */
export async function getSessionUser(): Promise<AuthUser | null> {
  try {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (!token) return null;

    const session = await prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) return null;
    if (session.user.status === "BLOCKED") return null;

    return {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      phone: session.user.phone,
      status: session.user.status,
    };
  } catch (err) {
    console.error("[auth] session lookup failed:", err);
    return null;
  }
}

export async function destroySession(): Promise<void> {
  try {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (token) {
      await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
    }
  } catch {
    // best effort
  }
  await clearSessionCookie();
}

/** Constant-time string compare (for tokens such as tracking lookups). */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
