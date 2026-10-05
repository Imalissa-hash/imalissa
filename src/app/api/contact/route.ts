import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, rateLimit, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";

const schema = z.object({
  name: z.string().min(2, "Please enter your name").max(80),
  email: z.string().email("Enter a valid email").optional().or(z.literal("")),
  phone: z
    .string()
    .regex(/^01[3-9]\d{8}$/, "Enter a valid BD mobile number")
    .optional()
    .or(z.literal("")),
  subject: z.string().min(2, "Enter a subject").max(120),
  message: z.string().min(10, "Please write at least a few words").max(2000),
});

/**
 * Contact form → stored as a notification for the admin team.
 * (No third-party email service is configured yet; messages are visible
 * in the admin panel. When real SMTP/CRM creds exist, send here too.)
 */
export const POST = withApi(async (req: NextRequest) => {
  rateLimit(`contact:${clientIp(req)}`, 5, 60_000);
  const body = parseBody(schema, await req.json().catch(() => ({})));

  const saved = await prisma.contactMessage.create({
    data: {
      name: body.name.trim(),
      email: body.email || null,
      phone: body.phone || null,
      subject: body.subject.trim(),
      message: body.message.trim(),
    },
  });

  await prisma.notification.create({
    data: {
      type: "SYSTEM",
      title: `Contact: ${body.subject.slice(0, 60)}`,
      body: `${body.name}${body.phone ? ` · ${body.phone}` : ""}${body.email ? ` · ${body.email}` : ""}`,
      link: `/admin/messages#${saved.id}`,
    },
  });

  const settings = await getSettings();
  return jsonOk({
    received: true,
    // Honest reply-channel info (from settings — no invented SLA).
    replyTo: { email: settings.contact.email, phone: settings.contact.phone },
  });
});

export const dynamic = "force-dynamic";
