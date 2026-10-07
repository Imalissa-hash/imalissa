import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, rateLimit, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { hashPassword, startSession } from "@/lib/auth";
import { badRequest, conflict } from "@/lib/errors";
import { mergeCarts } from "@/lib/cart";
import { cookies } from "next/headers";

/**
 * Signup: create the account and start the session in one step.
 *
 * (The emailed verification-code step is temporarily out while Render free
 * blocks outbound email — git history has it, and /api/auth/verify-otp stays
 * reachable for a later re-enable. Email stays REQUIRED: it is the account's
 * recovery channel.)
 *
 * Response: { id, name, email, phone }
 */
const registerSchema = z.object({
  name: z.string().min(2, "Please enter your name").max(80),
  email: z.string().email("Please enter a valid email").min(5),
  phone: z
    .string()
    .regex(/^01[3-9]\d{8}$/, "Enter a valid BD mobile number (e.g. 01712345678)"),
  password: z.string().min(6, "Password must be at least 6 characters").max(72),
});

export const POST = withApi(async (req: NextRequest) => {
  rateLimit(`register:${clientIp(req)}`, 5, 60_000);
  const body = parseBody(registerSchema, await req.json().catch(() => ({})));
  const email = body.email.trim().toLowerCase();

  const dup = await prisma.user.findFirst({
    where: { OR: [{ email }, { phone: body.phone }] },
  });
  if (dup) {
    throw conflict(
      dup.email && dup.email === email
        ? "An account with this email already exists"
        : "An account with this phone number already exists"
    );
  }

  // Create the account and sign the customer in (the unique email/phone are
  // enforced by the DB — the pre-flight above covers normal double submits).
  let user;
  try {
    user = await prisma.user.create({
      data: {
        name: body.name.trim(),
        email,
        phone: body.phone,
        passwordHash: await hashPassword(body.password),
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      throw conflict("An account with this email or phone number already exists");
    }
    throw err;
  }

  // Merge any guest cart, then start the session immediately.
  const store = await cookies();
  const guest = store.get("imalissa_guest")?.value ?? null;
  if (guest) await mergeCarts(user.id, guest);

  await startSession(user.id, clientIp(req), req.headers.get("user-agent") ?? undefined);

  return jsonOk({ id: user.id, name: user.name, email: user.email, phone: user.phone });
});

export const dynamic = "force-dynamic";
