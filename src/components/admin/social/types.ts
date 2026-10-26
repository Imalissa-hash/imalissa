/**
 * Shape of the Social Inbox data, shared by the server loader and the client
 * panels.
 *
 * It lives apart from inbox.ts on purpose: that module imports Prisma, and a
 * client component importing it — even for types only — invites a bundler to
 * pull server code into the browser. These declarations have no imports, so
 * both sides can depend on them without dragging anything along.
 */

/** One row of the conversation list — folded from many messages. */
export type ConversationRow = {
  /** Any message id in the conversation — only anchors the deep link. */
  id: string;
  channel: string;
  senderId: string;
  senderName: string | null;
  /** Newest message in the conversation, for the list preview. */
  preview: string;
  receivedAt: string;
  unread: boolean;
  hasReply: boolean;
  messageCount: number;
};

/** One message in a thread, either direction. */
export type ThreadMessage = {
  id: string;
  body: string;
  direction: "INBOUND" | "OUTBOUND";
  isRead: boolean;
  repliedAt: string | null;
  receivedAt: string;
};

export type InboxCounts = { unread: number; replied: number; total: number };
