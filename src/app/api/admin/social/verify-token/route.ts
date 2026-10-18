import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApi, jsonOk, jsonError, parseBody, clientIp } from "@/lib/api";
import { requirePermission } from "@/lib/permissions";
import { getSettingGroup, updateSettings } from "@/lib/settings";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const schema = z.object({
  verifyToken: z
    .string()
    .trim()
    .min(8, "Use at least 8 characters so it cannot be guessed")
    .max(200, "Keep it under 200 characters")
    .regex(
      /^[A-Za-z0-9._-]+$/,
      "Use only letters, numbers, dot, dash or underscore"
    ),
});

/**
 * POST /api/admin/social/verify-token — set the webhook verify token.
 *
 * This is the one value the owner has to invent for the Facebook webhook,
 * so it is minted from the admin screen rather than read out of .env. It is
 * NOT a credential in the app-secret class: Meta sends it back to us in the
 * clear on the verification GET, and we compare it in constant time. Leaking
 * it lets someone complete a handshake against a page we do not own — which
 * is why it is rotatable here instead of frozen in an env file.
 */
export const POST = withApi(async (req: NextRequest) => {
  const admin = await requirePermission("settings.manage");
  const { verifyToken } = parseBody(schema, await req.json());

  const previous = await getSettingGroup("social");

  await updateSettings({
    social: { ...previous, verifyToken },
  });

  await audit({
    adminId: admin.id,
    action: "SOCIAL_VERIFY_TOKEN_SET",
    entityType: "SiteSetting",
    entityId: "social.verifyToken",
    // The token itself is deliberately NOT in the audit details — the audit
    // log is read by more roles than the settings screen.
    details: { changed: previous.verifyToken !== verifyToken },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return jsonOk({ saved: true });
});

/** Nothing to read here — this route only writes. */
export const GET = () =>
  Promise.resolve(
    jsonError(405, "Use POST to set the verify token", { allow: ["POST"] })
  );
