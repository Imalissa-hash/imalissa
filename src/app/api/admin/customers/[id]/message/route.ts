import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { badRequest, notFound, publicMessage } from "@/lib/errors";
import { sendMail, emailConfigured } from "@/lib/mail";
import { waLink, waDigits } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  body: z
    .string()
    .min(1, "Type a message first")
    .max(1500, "Keep the message under 1500 characters"),
  channel: z.enum(["email", "whatsapp"]),
  subject: z.string().min(1).max(120).optional(),
});

/**
 * POST /api/admin/customers/[id]/message — send an admin message to a customer.
 *
 *   { body, channel, subject? }  →  { channel, delivery, ... }
 *
 * Two honest channels:
 *   - email    → real SMTP send. Failure = 502, never a fake success.
 *   - whatsapp → returns a pre-filled wa.me URL. Delivery happens manually in
 *                the app (we have no Business API token), so the response says
 *                delivery:"manual" and the UI words it that way.
 */
export const POST = withApi<Ctx>(async (req: NextRequest, ctx?: Ctx) => {
  const admin = await requirePermission("customers.manage");
  const id = (await ctx?.params)?.id ?? "";
  if (!id) throw notFound("Customer not found");

  const customer = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, phone: true },
  });
  if (!customer) throw notFound("Customer not found");

  const body = parseBody(schema, await req.json().catch(() => ({})));
  const text = body.body.trim();

  if (body.channel === "email") {
    if (!customer.email) {
      throw badRequest("This customer has no email address on file");
    }
    if (!emailConfigured()) {
      throw badRequest("Email is not configured on this server (BREVO_API_KEY or SMTP_* missing in .env)");
    }

    try {
      await sendMail({
        to: customer.email,
        subject: body.subject?.trim() || `Message from Imalissa`,
        text,
        html: `
          <div style="font-family:Arial,Helvetica,sans-serif;background:#0b0d10;padding:32px 16px;color:#e8eaed">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#12151b;border:1px solid #262a33;border-radius:16px">
              <tr><td style="padding:28px 28px 8px">
                <p style="margin:0;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#d4af37">Imalissa</p>
                <h1 style="margin:14px 0 6px;font-size:20px;color:#f4f5f7">${body.subject?.trim() || "A message from our team"}</h1>
                <p style="margin:0;font-size:14px;color:#9aa1ad">Hello ${customer.name},</p>
              </td></tr>
              <tr><td style="padding:10px 28px 26px">
                <p style="margin:0;font-size:15px;line-height:1.65;color:#e8eaed;white-space:pre-wrap">${text
                  .replace(/&/g, "&amp;")
                  .replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;")}</p>
              </td></tr>
            </table>
          </div>`,
      });
    } catch (err) {
      await audit({
        adminId: admin.id,
        action: "CUSTOMER_MESSAGE_FAILED",
        entityType: "User",
        entityId: id,
        details: { channel: "email", reason: publicMessage(err).message },
        ip: clientIp(req),
        userAgent: req.headers.get("user-agent"),
      });
      throw err; // 502/503 from sendMail — surfaced honestly
    }

    await audit({
      adminId: admin.id,
      action: "CUSTOMER_MESSAGE",
      entityType: "User",
      entityId: id,
      details: { channel: "email", to: customer.email, subject: body.subject ?? null, chars: text.length },
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent"),
    });

    return jsonOk({ channel: "email", delivery: "sent", to: customer.email });
  }

  // ── whatsapp: pre-filled chat, the admin presses Send ────
  const url = waLink(customer.phone, text);
  if (!url) {
    throw badRequest(
      customer.phone
        ? "This phone number cannot be used for WhatsApp — check it on the customer profile."
        : "This customer has no phone number on file for WhatsApp."
    );
  }

  await audit({
    adminId: admin.id,
    action: "CUSTOMER_MESSAGE",
    entityType: "User",
    entityId: id,
    details: {
      channel: "whatsapp",
      to: waDigits(customer.phone),
      chars: text.length,
      note: "chat opened — delivery is manual",
    },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({ channel: "whatsapp", delivery: "manual", to: customer.phone, url });
});
