import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, rateLimit, clientIp } from "@/lib/api";
import { applyCoupon } from "@/lib/cart";
import { getSessionUser } from "@/lib/auth";
import { cookies } from "next/headers";

const schema = z.object({ code: z.string().max(40).nullable() });

export const POST = withApi(async (req: NextRequest) => {
  rateLimit(`coupon:${clientIp(req)}`, 20, 60_000);
  const body = parseBody(schema, await req.json().catch(() => ({})));
  const user = await getSessionUser();
  const store = await cookies();
  const guest = store.get("imalissa_guest")?.value ?? null;

  const summary = await applyCoupon(user?.id ?? null, guest, body.code);
  return jsonOk(summary);
});
