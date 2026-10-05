import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, rateLimit, clientIp } from "@/lib/api";
import { prisma } from "@/lib/db";

const schema = z.object({
  email: z.string().email("Please enter a valid email"),
});

export const POST = withApi(async (req: NextRequest) => {
  rateLimit(`newsletter:${clientIp(req)}`, 5, 60_000);
  const body = parseBody(schema, await req.json().catch(() => ({})));

  await prisma.newsletterSubscriber.upsert({
    where: { email: body.email.toLowerCase().trim() },
    update: { isActive: true },
    create: { email: body.email.toLowerCase().trim() },
  });

  return jsonOk({ subscribed: true });
});
