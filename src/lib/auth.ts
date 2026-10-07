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
 * The work factor lives inside each hash, so the cost stays at 10 (OWASP
 * minimum) — what changed is the IMPLEMENTATION: pure-JS `bcryptjs` needs
 * ~1.25 s for one cost-10 compare on the Render free instance (~2.8 s at
 * cost 12), which was most of the login time. Native `bcrypt` (the C
 * reference implementation) runs the same algorithm in a fraction of that,
 * and both libraries read each other's hashes interchangeably — existing
 * rows need no migration. Stored cost-12 hashes still verify and are
 * rewritten to this setting on the owner's next successful login via
 * `needsRehash`.
 */
const COST = 10;

export async function hashPassword(password: string): Promise<string> {
  const bcrypt = await import("bcrypt");
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
    const bcrypt = await import("bcrypt");
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

/**
 * In-memory session cache. A session lookup is one database round trip, and
 * with the database in a different region than the app that costs ~550 ms on
 * every authenticated request. Entries live 30 s, so admin blocks and
 * password resets take effect within 30 s at worst; logout (see
 * destroySession) evicts immediately. Render free runs a single instance,
 * so one map serves every request.
 */
const SESSION_CACHE_MS = 30_000;
const sessionCache = new Map<string, { user: AuthUser; at: number }>();

/** Resolve the logged-in customer (or null). Safe to call anywhere server-side. */
export async function getSessionUser(): Promise<AuthUser | null> {
  try {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const key = sha256(token);

    const cached = sessionCache.get(key);
    if (cached && Date.now() - cached.at < SESSION_CACHE_MS) return cached.user;

    const session = await prisma.session.findUnique({
      where: { tokenHash: key },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) return null;
    if (session.user.status === "BLOCKED") return null;

    const user: AuthUser = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      phone: session.user.phone,
      status: session.user.status,
    };
    sessionCache.set(key, { user, at: Date.now() });
    return user;
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
      const key = sha256(token);
      sessionCache.delete(key); // effective immediately, not after the TTL
      await prisma.session.deleteMany({ where: { tokenHash: key } });
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
