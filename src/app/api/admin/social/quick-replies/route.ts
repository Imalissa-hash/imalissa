import { NextRequest } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, parseBody, rateLimit, clientIp } from "@/lib/api";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { badRequest } from "@/lib/errors";
import { getSettingGroup, updateSettings } from "@/lib/settings";

/**
 * PATCH /api/admin/social/quick-replies — replace the whole canned-reply list.
 *
 * The whole list rather than an individual item: the stored value is a single
 * ordered JSON array, so a single atomic write keeps the order the admin sees
 * on screen exactly the order the composer will offer. It also makes add,
 * edit, delete and reorder one code path instead of four.
 *
 *     { "items": [ { "label": "সালাম", "text": "…" }, … ] }
 *
 * Guarded by `customers.manage` — the same permission that lets someone send
 * a reply, because these buttons exist only to compose one. Reads already
 * happen through the page (settings), so there is deliberately no GET here.
 *
 * SECURITY: `label` and `text` are plain text that lands in a Facebook
 * message. Neither is ever parsed, interpolated into a query, or treated as a
 * URL, and the bounds below keep a pasted payload from turning the composer
 * list into a megabyte of noise. Credentials can never appear here — the body
 * schema only admits these two fields.
 */
const itemSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Give the button a short label")
    .max(40, "Keep the button label under 40 characters"),
  text: z
    .string()
    .trim()
    .min(1, "Reply text cannot be empty")
    .max(2000, "Keep the reply under 2000 characters"),
});

const bodySchema = z.object({
  items: z
    .array(itemSchema)
    .max(40, "Keep at most 40 saved replies"),
});

export const PATCH = withApi(async (req: NextRequest) => {
  const admin = await requirePermission("customers.manage");
  rateLimit(`admin-quick-replies:${clientIp(req)}`, 30, 60_000);

  const raw = await req.json().catch(() => null);
  if (raw === null || typeof raw !== "object") throw badRequest("Invalid JSON body");

  const { items } = parseBody(bodySchema, raw);
  if (items.length === 0) {
    throw badRequest("Keep at least one saved reply — an empty list would leave the panel blank.");
  }

  // Read-modify-write of the ONE group this touches; verifyToken and pageId
  // are carried forward untouched so saving replies can never clear the
  // webhook configuration sitting beside them.
  const current = await getSettingGroup("social");
  await updateSettings({
    social: { ...current, quickReplies: items },
  });

  await audit({
    adminId: admin.id,
    action: "SOCIAL_QUICK_REPLIES_UPDATE",
    entityType: "SiteSetting",
    entityId: "social.quickReplies",
    details: { count: items.length },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({ items });
});

export const dynamic = "force-dynamic";
