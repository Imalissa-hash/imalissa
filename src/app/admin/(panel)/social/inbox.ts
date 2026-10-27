import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type {
  ConversationRow,
  ThreadMessage,
  InboxCounts,
} from "@/components/admin/social/types";

// Re-exported so pages keep a single import site; the declarations themselves
// live in a module with no imports so client code can share them safely.
export type { ConversationRow, ThreadMessage, InboxCounts };

/**
 * Shared loading for the Social Inbox's two routes:
 *
 *   /admin/social      → conversation list, nothing selected
 *   /admin/social/[id] → same list + the thread for one conversation
 *
 * Both pages render one client component, so the list must be built the same
 * way in both or the panel would visibly change when a conversation opens.
 *
 * ── Why this groups at all ─────────────────────────────────────
 * SocialMessage is a flat log of every message in both directions. Read raw,
 * a person who sent five messages occupies five rows of the conversation
 * list, and our own replies appear as separate "people". The list therefore
 * folds rows into conversations keyed by (channel, senderId).
 *
 * ── The bounded window, stated honestly ────────────────────────
 * MySQL cannot express "latest row per group" through Prisma's query builder,
 * so the newest WINDOW messages are read and folded in memory. Above that
 * window the counts stop being exact. It is 500 rather than unbounded so one
 * conversation cannot drag the whole history into an admin page load.
 */
const WINDOW = 500;
const PAGE_SIZE = 20;

export type InboxResult = {
  items: ConversationRow[];
  counts: InboxCounts;
  total: number;
  totalPages: number;
  page: number;
  /**
   * The box actually displayed.
   *
   * Usually identical to the requested one, but see the fallback below: the
   * tab shown highlighted must be the tab whose contents are on screen, or
   * the header and the list disagree.
   */
  effectiveBox: string;
};

type RawRow = {
  id: string;
  channel: string;
  senderId: string;
  senderName: string | null;
  body: string;
  isRead: boolean;
  repliedAt: Date | null;
  receivedAt: Date;
};

function buildWhere(q: string): Prisma.SocialMessageWhereInput {
  if (!q) return {};
  return {
    OR: [
      { senderName: { contains: q } },
      { senderId: { contains: q } },
      { body: { contains: q } },
    ],
  };
}

/** Fold a newest-first slice of the log into one row per conversation. */
function fold(rows: RawRow[]): ConversationRow[] {
  const byKey = new Map<string, ConversationRow>();
  // Newest-first means the first row seen for a key IS the newest, so the
  // preview comes from it and later rows only contribute flags.
  for (const r of rows) {
    const key = `${r.channel}\u0000${r.senderId}`;
    const existing = byKey.get(key);
    if (existing) {
      if (!r.isRead) existing.unread = true;
      if (r.repliedAt) existing.hasReply = true;
      existing.messageCount += 1;
      continue;
    }
    byKey.set(key, {
      id: r.id,
      channel: r.channel,
      senderId: r.senderId,
      senderName: r.senderName,
      preview: r.body,
      receivedAt: r.receivedAt.toISOString(),
      unread: !r.isRead,
      hasReply: Boolean(r.repliedAt),
      messageCount: 1,
    });
  }
  return [...byKey.values()];
}

/**
 * A conversation can carry a name on an older row even when the newest row
 * has none (Meta only supplies a name when it resolves a profile), so the
 * label is lifted from any row that has one.
 */
async function attachNames(items: ConversationRow[]): Promise<void> {
  const withoutName = items.filter((i) => !i.senderName);
  if (withoutName.length === 0) return;
  const found = await prisma.socialMessage.findMany({
    where: { senderId: { in: withoutName.map((i) => i.senderId) }, senderName: { not: null } },
    select: { senderId: true, senderName: true },
    distinct: ["senderId"],
  });
  const map = new Map(found.map((f) => [f.senderId, f.senderName]));
  for (const i of items) {
    if (!i.senderName) i.senderName = map.get(i.senderId) ?? null;
  }
}

export async function loadInbox(params: {
  box: string;
  /**
   * Whether the visitor actually chose this box, versus it being the default
   * because no `box` param was in the URL. Only the default is allowed to
   * fall back — someone who clicked "Unread" asked for exactly that and
   * should see it say so rather than be handed different contents.
   */
  boxExplicit: boolean;
  q: string;
  requestedPage: number;
}): Promise<InboxResult> {
  const { box, boxExplicit, q, requestedPage } = params;

  const rows = (await prisma.socialMessage.findMany({
    where: buildWhere(q),
    orderBy: { receivedAt: "desc" },
    take: WINDOW,
    select: {
      id: true,
      channel: true,
      senderId: true,
      senderName: true,
      body: true,
      isRead: true,
      repliedAt: true,
      receivedAt: true,
    },
  })) as RawRow[];

  const all = fold(rows);
  await attachNames(all);

  const counts: InboxCounts = {
    unread: all.filter((c) => c.unread).length,
    replied: all.filter((c) => c.hasReply).length,
    total: all.length,
  };

  /**
   * The default box is "unread", which is the right instinct for an inbox —
   * but if nothing happens to be unread it renders "No conversations yet"
   * over a list that in fact holds every conversation. Someone debugging a
   * webhook concludes it is broken when only their filter is, which is
   * exactly how this was reported.
   *
   * So the DEFAULT falls back to "all" whenever it would otherwise be empty.
   * A box the visitor chose deliberately never falls back: it reports the
   * truth instead, because quietly handing back different contents than were
   * asked for is its own kind of misleading.
   */
  let effectiveBox = box;
  if (!boxExplicit && box === "unread" && counts.unread === 0 && counts.total > 0) {
    effectiveBox = "all";
  }

  // The box filters CONVERSATIONS, not messages: a thread counts as unread
  // if anything in it is unread, however many messages that is.
  let list = all;
  if (effectiveBox === "unread") list = all.filter((c) => c.unread);
  if (effectiveBox === "replied") list = all.filter((c) => c.hasReply);

  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), totalPages);

  return {
    items: list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    counts,
    total,
    totalPages,
    page,
    effectiveBox,
  };
}

/**
 * The whole conversation for one anchor id, oldest first.
 *
 * The URL id is only a way in: a conversation has no table of its own, it is
 * every SocialMessage sharing a channel and senderId — which is exactly what
 * a reply is addressed to. Oldest-first because a thread reads downward in
 * arrival order, the opposite of the list's newest-first.
 */
export async function loadThread(anchorId: string): Promise<{
  anchor: { id: string; senderId: string; channel: string } | null;
  messages: ThreadMessage[];
  senderName: string | null;
} | null> {
  const anchor = await prisma.socialMessage.findUnique({
    where: { id: anchorId },
    select: { id: true, senderId: true, channel: true, senderName: true },
  });
  if (!anchor) return null;

  const rows = await prisma.socialMessage.findMany({
    where: { senderId: anchor.senderId, channel: anchor.channel },
    orderBy: { receivedAt: "asc" },
    select: {
      id: true,
      body: true,
      direction: true,
      isRead: true,
      repliedAt: true,
      receivedAt: true,
      senderName: true,
    },
  });

  const senderName =
    rows.find((r) => r.senderName)?.senderName ?? anchor.senderName ?? "Facebook sender";

  return {
    anchor: { id: anchor.id, senderId: anchor.senderId, channel: anchor.channel },
    senderName,
    messages: rows.map((m) => ({
      id: m.id,
      body: m.body,
      direction: m.direction === "OUTBOUND" ? "OUTBOUND" : "INBOUND",
      isRead: m.isRead,
      repliedAt: m.repliedAt ? m.repliedAt.toISOString() : null,
      receivedAt: m.receivedAt.toISOString(),
    })),
  };
}
