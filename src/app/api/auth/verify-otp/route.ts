import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, rateLimit, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { startSession } from "@/lib/auth";
import { badRequest, conflict, unauthorized } from "@/lib/errors";
import { verifyOtp, type OtpPurpose } from "@/lib/otp";
import { mergeCarts } from "@/lib/cart";
import { cookies } from "next/headers";

/**
 * Step 2 of signup/login: confirm the 6-digit code sent to the email.
 *
 *   POST { purpose: "register" | "login", email, code }
 *
 * register → creates the held account, merges the guest cart, starts session
 * login    → starts the session for the verified user
 *
 * Response: { id, name, email, phone } — same shape the auth UI already
 * consumes after a normal login.
 */
const schema = z.object({
  purpose: z.enum(["register", "login"]),
  email: z.string().email("Enter the email the code was sent to"),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

export const POST = withApi(async (req: NextRequest) => {
  const body = parseBody(schema, await req.json().catch(() => ({})));
  const purpose: OtpPurpose = body.purpose;
  const ip = clientIp(req);
  rateLimit(`otp-verify:${ip}`, 10, 300_000);
  rateLimit(`otp-verify:${body.email.trim().toLowerCase()}`, 10, 300_000);

  // Throws 400 on expired / wrong / exhausted code (record deleted inside).
  const payload = await verifyOtp(purpose, body.email, body.code);

  let user;
  if (purpose === "register") {
    const name = String(payload.name ?? "").trim();
    const email = String(payload.email ?? "").trim().toLowerCase();
    const phone = String(payload.phone ?? "");
    const passwordHash = String(payload.passwordHash ?? "");
    if (!name || !email || !passwordHash) {
      throw badRequest("That signup session expired. Please start again.");
    }

    // Re-check uniqueness: the address may have been taken while the user
    // was reading their email.
    const dup = await prisma.user.findFirst({
      where: { OR: [{ email }, { phone }] },
    });
    if (dup) {
      throw conflict(
        dup.email === email
          ? "An account with this email already exists — please sign in"
          : "An account with this phone number already exists — please sign in"
      );
    }

    user = await prisma.user.create({
      data: { name, email, phone, passwordHash },
    });
  } else {
    const userId = String(payload.userId ?? "");
    if (!userId) throw badRequest("That sign-in session expired. Please try again.");
    user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw unauthorized("Account not found. Please sign in again.");
    if (user.status === "BLOCKED") {
      throw badRequest("Your account has been suspended. Contact support.");
    }
  }

  // Merge any guest cart into the account, then start the session.
  const store = await cookies();
  const guest = store.get("imalissa_guest")?.value ?? null;
  if (guest) await mergeCarts(user!.id, guest);

  await startSession(user!.id, ip, req.headers.get("user-agent") ?? undefined);

  return jsonOk({
    id: user!.id,
    name: user!.name,
    email: user!.email,
    phone: user!.phone,
  });
});

export const dynamic = "force-dynamic";
