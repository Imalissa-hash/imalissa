import { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { withApi, jsonOk, parseBody, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { conflict, notFound, publicMessage } from "@/lib/errors";
import { hashPassword } from "@/lib/auth";
import { isStrongPassword } from "@/lib/validation";
import { sendMail, emailConfigured } from "@/lib/mail";
import type { CustomerDetail } from "@/components/admin/sales/CustomerDetailClient";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const idFrom = async (ctx?: Ctx): Promise<string> => (await ctx?.params)?.id ?? "";

const patchSchema = z.object({
  status: z.enum(["ACTIVE", "BLOCKED"]).optional(),
  /** Plain new password. Omit it together with generatePassword to skip. */
  password: z
    .string()
    .min(8, "Use 8+ characters with letters and numbers")
    .refine(isStrongPassword, "Use 8+ characters with letters and numbers")
    .optional(),
  /** Ask the server to mint a strong password instead of typing one. */
  generatePassword: z.boolean().optional(),
  /** Also email the new password to the customer's address. */
  emailPassword: z.boolean().optional(),
});

/**
 * 12 characters, always ≥1 letter and ≥1 digit (satisfies isStrongPassword),
 * built from crypto.randomInt — never Math.random.
 */
function generatePassword(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const all = letters + digits;
  const pick = (set: string) => set[randomBytes(1)[0] % set.length];

  const chars = [pick(letters), pick(digits)];
  for (let i = 0; i < 10; i += 1) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomBytes(1)[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/**
 * Branded email carrying the new password. The plaintext is NOT written to
 * the audit log — only the fact that it was reset and whether it was mailed.
 */
async function emailPasswordToCustomer(opts: {
  to: string;
  name: string;
  password: string;
}): Promise<{ ok: boolean; message: string }> {
  if (!emailConfigured()) {
    return { ok: false, message: "Email is not configured on this server (BREVO_API_KEY or SMTP_* missing) — the password was NOT emailed." };
  }

  const subject = "Your Imalissa account password has been changed";
  const text =
    `Hello ${opts.name},\n\n` +
    `An Imalissa administrator set a new password for your account (${opts.to}).\n\n` +
    `Your new password: ${opts.password}\n\n` +
    `Sign in at /auth/login with your email and this password, then change it from Account → Settings.\n` +
    `If you did not expect this change, contact us immediately.\n\n` +
    `— Team Imalissa`;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;background:#0b0d10;padding:32px 16px;color:#e8eaed">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#12151b;border:1px solid #262a33;border-radius:16px">
        <tr><td style="padding:28px 28px 8px">
          <p style="margin:0;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#d4af37">Imalissa · Account</p>
          <h1 style="margin:14px 0 6px;font-size:21px;color:#f4f5f7">Your password was changed</h1>
          <p style="margin:0;font-size:14px;color:#9aa1ad">Hello ${opts.name} — an administrator set a new password for your account.</p>
        </td></tr>
        <tr><td style="padding:8px 28px">
          <p style="margin:0;font-size:13px;color:#9aa1ad">New password</p>
          <p style="margin:6px 0 0;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:20px;letter-spacing:.12em;color:#d4af37;background:#0f1116;border:1px solid #262a33;border-radius:10px;padding:12px 14px">${opts.password}</p>
        </td></tr>
        <tr><td style="padding:16px 28px 26px">
          <a href="${(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "")}/auth/login" style="display:block;text-align:center;background:#d4af37;color:#12151b;font-weight:bold;font-size:15px;text-decoration:none;border-radius:10px;padding:14px 18px">Sign in to Imalissa</a>
          <p style="margin:14px 0 0;font-size:12px;color:#5f6672">For your security, please change this password after signing in. If you did not request this, contact us immediately.</p>
        </td></tr>
      </table>
    </div>`;

  try {
    await sendMail({ to: opts.to, subject, text, html });
    return { ok: true, message: `Emailed to ${opts.to}` };
  } catch (err) {
    // The password DID change — say so plainly and report the mail failure.
    return { ok: false, message: `Password changed, but the email failed: ${publicMessage(err).message}` };
  }
}

// ── GET /api/admin/customers/[id] — profile + orders summary ──
export const GET = withApi<Ctx>(async (req: NextRequest, ctx?: Ctx) => {
  await requirePermission("customers.view");
  const id = await idFrom(ctx);
  if (!id) throw notFound("Customer not found");

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      status: true,
      createdAt: true,
      addresses: {
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        select: {
          id: true,
          type: true,
          fullName: true,
          phone: true,
          division: true,
          district: true,
          area: true,
          fullAddress: true,
          isDefault: true,
        },
      },
      _count: { select: { orders: { where: { deletedAt: null } }, reviews: true } },
    },
  });
  if (!user) throw notFound("Customer not found");

  const [spend, lastOrder, recentOrders] = await Promise.all([
    prisma.order.aggregate({
      where: { userId: id, status: { notIn: ["CANCELLED", "FAILED", "RETURNED"] }, deletedAt: null },
      _sum: { total: true },
    }),
    prisma.order.aggregate({ where: { userId: id, deletedAt: null }, _max: { placedAt: true } }),
    prisma.order.findMany({
      where: { userId: id, deletedAt: null },
      orderBy: { placedAt: "desc" },
      take: 10,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        total: true,
        placedAt: true,
      },
    }),
  ]);

  const payload: CustomerDetail = {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    addresses: user.addresses.map((a) => ({ ...a, type: a.type })),
    stats: {
      ordersCount: user._count.orders,
      reviewsCount: user._count.reviews,
      totalSpent: Number(spend._sum.total ?? 0),
      lastOrderAt: lastOrder._max.placedAt?.toISOString() ?? null,
    },
    recentOrders: recentOrders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      paymentStatus: o.paymentStatus,
      total: Number(o.total),
      placedAt: o.placedAt.toISOString(),
    })),
  };

  return jsonOk(payload);
});

// ── PATCH /api/admin/customers/[id] — block / unblock · set password ──
export const PATCH = withApi<Ctx>(async (req: NextRequest, ctx?: Ctx) => {
  const admin = await requirePermission("customers.manage");
  const id = await idFrom(ctx);
  if (!id) throw notFound("Customer not found");

  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, phone: true, status: true },
  });
  if (!existing) throw notFound("Customer not found");

  const body = parseBody(patchSchema, await req.json().catch(() => ({})));

  const result: {
    id: string;
    changed: boolean;
    status?: string;
    /** Only present right after an admin sets it — never read back from the DB. */
    password?: string;
    email?: { ok: boolean; message: string };
  } = { id, changed: false };

  // ── block / unblock ──────────────────────────────────────
  if (body.status !== undefined) {
    result.status = existing.status;
    if (body.status !== existing.status) {
      await prisma.user.update({ where: { id }, data: { status: body.status } });
      await audit({
        adminId: admin.id,
        action: body.status === "BLOCKED" ? "CUSTOMER_BLOCK" : "CUSTOMER_UNBLOCK",
        entityType: "User",
        entityId: id,
        details: {
          name: existing.name,
          email: existing.email,
          from: existing.status,
          to: body.status,
        },
        ip: clientIp(req),
        userAgent: req.headers.get("user-agent"),
      });
      result.status = body.status;
      result.changed = true;
    }
  }

  // ── password ─────────────────────────────────────────────
  if (body.password !== undefined || body.generatePassword) {
    // A generated value wins over a typed one when both are sent.
    const plain = body.generatePassword ? generatePassword() : body.password!;
    const passwordHash = await hashPassword(plain);

    await prisma.$transaction([
      prisma.user.update({ where: { id }, data: { passwordHash } }),
      // Sign the customer out everywhere — the old credential stops working now.
      prisma.session.deleteMany({ where: { userId: id } }),
    ]);

    let emailed: { ok: boolean; message: string } | undefined;
    if (body.emailPassword) {
      emailed = existing.email
        ? await emailPasswordToCustomer({ to: existing.email, name: existing.name, password: plain })
        : {
            ok: false,
            message: "This customer has no email address on file — the password was NOT emailed.",
          };
    }

    await audit({
      adminId: admin.id,
      action: "CUSTOMER_PASSWORD_RESET",
      entityType: "User",
      entityId: id,
      // The plaintext password is deliberately NOT part of the audit trail.
      details: {
        name: existing.name,
        email: existing.email,
        generated: Boolean(body.generatePassword),
        emailed: emailed?.ok ?? false,
      },
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent"),
    });

    result.password = plain;
    if (emailed) result.email = emailed;
    result.changed = true;
  }

  return jsonOk(result);
});

// ── DELETE /api/admin/customers/[id] — permanent removal ─────────
/**
 * Blocked when the account has orders: order history (including orders already
 * pushed to the supplier) must survive. Everything else cascades per the
 * schema — address, cart, wishlist, reviews, sessions, notifications,
 * recently-viewed; coupon usages keep the order link with userId nulled.
 */
export const DELETE = withApi<Ctx>(async (req: NextRequest, ctx?: Ctx) => {
  const admin = await requirePermission("customers.manage");
  const id = await idFrom(ctx);
  if (!id) throw notFound("Customer not found");

  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, phone: true },
  });
  if (!existing) throw notFound("Customer not found");

  const orders = await prisma.order.count({ where: { userId: id } });
  if (orders > 0) {
    throw conflict(
      `This customer has ${orders} order${orders === 1 ? "" : "s"} — deleting the account would destroy that order history (including orders already sent to the supplier). Block the account instead.`
    );
  }

  await prisma.user.delete({ where: { id } });

  await audit({
    adminId: admin.id,
    action: "CUSTOMER_DELETE",
    entityType: "User",
    entityId: id,
    details: { name: existing.name, email: existing.email, phone: existing.phone },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({ id, deleted: true, name: existing.name });
});
