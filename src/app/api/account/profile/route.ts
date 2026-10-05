import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, rateLimit, clientIp } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { verifyPassword, hashPassword } from "@/lib/auth";
import { badRequest, unauthorized } from "@/lib/errors";
import { prisma } from "@/lib/db";

/** Update profile (name/phone/email) or change password. */
export const PATCH = withApi(async (req: NextRequest) => {
  const user = await getSessionUser();
  if (!user) throw unauthorized();

  const body = await req.json().catch(() => ({}));

  // ── Password change ────────────────────────────────────────────
  if (body.currentPassword || body.newPassword) {
    rateLimit(`pwchange:${clientIp(req)}`, 5, 60_000);
    const schema = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8, "New password must be at least 8 characters"),
    });
    const data = parseBody(schema, body);

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) throw unauthorized();

    const ok = await verifyPassword(data.currentPassword, dbUser.passwordHash);
    if (!ok) throw badRequest("Current password is incorrect");

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(data.newPassword) },
    });

    // Invalidate all other sessions (keep current one).
    const { cookies } = await import("next/headers");
    const { createHash } = await import("crypto");
    const store = await cookies();
    const token = store.get("imalissa_session")?.value;
    const currentHash = token
      ? createHash("sha256").update(token).digest("hex")
      : null;
    await prisma.session.deleteMany({
      where: { userId: user.id, ...(currentHash ? { NOT: { tokenHash: currentHash } } : {}) },
    });

    return jsonOk({ passwordChanged: true });
  }

  // ── Profile update ─────────────────────────────────────────────
  const schema = z.object({
    name: z.string().min(2).max(80).optional(),
    phone: z
      .string()
      .regex(/^01[3-9]\d{8}$/, "Enter a valid BD mobile number")
      .optional(),
    email: z.string().email("Enter a valid email").optional().or(z.literal("")),
  });
  const data = parseBody(schema, body);

  if (data.phone) {
    const dupPhone = await prisma.user.findFirst({
      where: { phone: data.phone, NOT: { id: user.id } },
    });
    if (dupPhone) throw badRequest("This phone number is already used by another account");
  }
  const emailVal = data.email?.toLowerCase().trim() || null;
  if (emailVal) {
    const dupEmail = await prisma.user.findFirst({
      where: { email: emailVal, NOT: { id: user.id } },
    });
    if (dupEmail) throw badRequest("This email is already used by another account");
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.email !== undefined ? { email: emailVal } : {}),
    },
    select: { id: true, name: true, email: true, phone: true },
  });

  return jsonOk(updated);
});

export const dynamic = "force-dynamic";
