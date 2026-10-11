import { NextRequest } from "next/server";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { withApi, jsonOk, rateLimit, clientIp } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { badRequest, unauthorized } from "@/lib/errors";
import { bytesMatchExtension } from "@/lib/image-bytes";

export const dynamic = "force-dynamic";

/** Allowed image mimes → extension (derived from the mime, never from a
 *  client-supplied filename). Chat photos are display-only, so no SVG. */
const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const MAX_BYTES = 4 * 1024 * 1024; // 4MB — same cap as the admin upload

/**
 * POST /api/chat/upload — a logged-in customer attaches a photo to the
 * support chat (multipart field "file"). The AI identifies it against the
 * catalog and answers with the product's price and details.
 *
 * Dual-write like the admin upload: `public/uploads/chat/` for the fast
 * static path AND a StoredImage row so the photo survives Render's deploys
 * (its free tier wipes the disk on every release).
 */
export const POST = withApi(async (req: NextRequest) => {
  rateLimit(`chat-upload:${clientIp(req)}`, 12, 60_000);
  const user = await getSessionUser();
  if (!user) throw unauthorized("Please log in to chat with us");

  const form = await req.formData().catch(() => null);
  const entry = form?.get("file");
  if (!entry || typeof entry === "string") {
    throw badRequest('No file received — send it as multipart field "file"');
  }
  if (entry.size === 0) throw badRequest("The file is empty");
  if (entry.size > MAX_BYTES) throw badRequest("Photo is too large — the maximum size is 4MB");

  const ext = MIME_EXT[entry.type];
  if (!ext) throw badRequest("Unsupported photo type. Allowed: JPEG, PNG, WebP");

  // Random URL-safe stem — the client's filename never reaches the path.
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
  const dirPath = path.join(process.cwd(), "public", "uploads", "chat");
  mkdirSync(dirPath, { recursive: true });
  const bytes = Buffer.from(await entry.arrayBuffer());

  // Same magic-byte check as the admin upload: the declared mime decides the
  // extension, the bytes must prove they belong to it.
  if (!bytesMatchExtension(bytes, ext)) {
    throw badRequest("This file is not a valid image — its contents do not match its type");
  }

  writeFileSync(path.join(dirPath, name), bytes);

  // Durable copy in the shared DB (Render's disk is ephemeral).
  try {
    await prisma.storedImage.upsert({
      where: { key: `chat/${name}` },
      update: { mime: entry.type, bytes },
      create: { key: `chat/${name}`, mime: entry.type, bytes },
    });
  } catch (err) {
    console.error(
      `[chat-upload] could not persist chat/${name} to the DB — the photo works now but will vanish on the next deploy:`,
      err
    );
  }

  return jsonOk({ url: `/uploads/chat/${name}` });
});
