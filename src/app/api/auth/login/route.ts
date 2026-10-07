import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, rateLimit, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { hashPassword, needsRehash, startSession, verifyPassword } from "@/lib/auth";
import { badRequest, unauthorized } from "@/lib/errors";
import { mergeCarts } from "@/lib/cart";
import { cookies } from "next/headers";

/**
 * Login with email/phone + password.
 *
 * The password is checked FIRST (no account enumeration) and the session
 * starts immediately. The emailed 6-digit code step is temporarily out while
 * Render free blocks outbound email (see git history for it) —
 * /api/auth/verify-otp stays reachable so the code step can be re-enabled
 * once a working email channel exists.
 *
 * Response: { id, name, email, phone }
 */
const schema = z.object({
  identifier: z.string().min(3, "Enter your email or phone"),
  password: z.string().min(1, "Enter your password"),
});

export const POST = withApi(async (req: NextRequest) => {
  rateLimit(`login:${clientIp(req)}`, 8, 60_000);
  const body = parseBody(schema, await req.json().catch(() => ({})));
  const id = body.identifier.trim().toLowerCase();

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: id }, { phone: body.identifier.trim() }] },
  });

  // Same error for unknown user vs wrong password (no account enumeration).
  if (!user) throw unauthorized("Invalid credentials. Please try again.");

  const ok = await verifyPassword(body.password, user.passwordHash);
  if (!ok) throw unauthorized("Invalid credentials. Please try again.");

  // Legacy cost-12 hashes cost seconds to verify; the plaintext is in hand
  // right now, so upgrade the row for the next login. A failure here must
  // never block the login itself.
  if (needsRehash(user.passwordHash)) {
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(body.password) },
      });
    } catch {
      /* stays on the old hash until the next successful login */
    }
  }

  if (user.status === "BLOCKED") throw badRequest("Your account has been suspended. Contact support.");

  // Merge any guest cart into the account, then start the session right away
  // (the same steps /api/auth/verify-otp used to run after the code matched).
  const store = await cookies();
  const guest = store.get("imalissa_guest")?.value ?? null;
  if (guest) await mergeCarts(user.id, guest);

  await startSession(user.id, clientIp(req), req.headers.get("user-agent") ?? undefined);

  return jsonOk({ id: user.id, name: user.name, email: user.email, phone: user.phone });
});

export const dynamic = "force-dynamic";
