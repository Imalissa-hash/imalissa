"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, CheckCircle2, AlertTriangle, Mail, MailOpen } from "lucide-react";
import { Panel, BusyBtn } from "@/components/admin/ui";
import { cn, formatDate, timeAgo } from "@/lib/utils";

export interface MessageDetail {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  subject: string;
  message: string;
  isRead: boolean;
  archived: boolean;
  createdAt: string;
}

interface Notice {
  tone: "ok" | "err";
  text: string;
}

type MsgAction = "markRead" | "archive" | "unarchive";

export function MessageDetailClient({ message }: { message: MessageDetail }) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<MsgAction | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const run = async (action: MsgAction) => {
    setBusyAction(action);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/messages/${message.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => ({ ok: false }));
      if (!json.ok) {
        setNotice({ tone: "err", text: json.message ?? "Could not update the message" });
      } else {
        setNotice({
          tone: "ok",
          text:
            action === "markRead"
              ? "Marked as read"
              : action === "archive"
                ? "Message archived"
                : "Message restored to the inbox",
        });
        router.refresh();
      }
    } catch {
      setNotice({ tone: "err", text: "Network error — please try again" });
    } finally {
      setBusyAction(null);
    }
  };

  const unread = !message.isRead;

  return (
    <div className="space-y-5">
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-display text-xl font-bold text-mist-50">{message.subject}</h1>
              <span
                className={cn(
                  "inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-wide",
                  message.archived
                    ? "border-white/15 bg-white/[0.05] text-mist-400"
                    : unread
                      ? "border-gold-500/40 bg-gold-500/10 text-gold-300"
                      : "border-success/30 bg-success/10 text-success"
                )}
              >
                {message.archived ? "Archived" : unread ? "Unread" : "Read"}
              </span>
            </div>
            <p className="mt-1 text-[0.82rem] text-mist-500">
              From <span className="font-semibold text-mist-300">{message.name}</span>
              {message.email ? ` · ${message.email}` : ""}
              {message.phone ? ` · ${message.phone}` : ""}
            </p>
            <p className="text-[0.76rem] text-mist-600">
              Received {formatDate(message.createdAt)} · {timeAgo(message.createdAt)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {message.email && (
              <a
                href={`mailto:${message.email}?subject=${encodeURIComponent(`Re: ${message.subject}`)}`}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/12 px-4 py-2.5 text-[0.84rem] font-semibold text-mist-300 transition hover:border-gold-500/40 hover:text-gold-300"
              >
                <Mail size={14} /> Reply by email
              </a>
            )}
            {unread && (
              <BusyBtn
                busy={busyAction === "markRead"}
                disabled={busyAction !== null}
                variant="outline"
                onClick={() => run("markRead")}
              >
                <MailOpen size={14} /> Mark read
              </BusyBtn>
            )}
            {message.archived ? (
              <BusyBtn
                busy={busyAction === "unarchive"}
                disabled={busyAction !== null}
                variant="outline"
                onClick={() => run("unarchive")}
              >
                <ArchiveRestore size={14} /> Restore
              </BusyBtn>
            ) : (
              <BusyBtn
                busy={busyAction === "archive"}
                disabled={busyAction !== null}
                variant="outline"
                onClick={() => run("archive")}
              >
                <Archive size={14} /> Archive
              </BusyBtn>
            )}
          </div>
        </div>

        {notice && (
          <div
            className={
              notice.tone === "ok"
                ? "mt-4 flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-[0.84rem] text-success"
                : "mt-4 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-[0.84rem] text-danger"
            }
          >
            {notice.tone === "ok" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
            {notice.text}
          </div>
        )}
      </Panel>

      <Panel title="Message">
        <p className="whitespace-pre-wrap text-[0.9rem] leading-relaxed text-mist-200">
          {message.message}
        </p>
      </Panel>
    </div>
  );
}
