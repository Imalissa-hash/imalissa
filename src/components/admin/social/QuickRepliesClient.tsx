"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Panel, Field, TextInput, TextArea, Btn, BusyBtn } from "@/components/admin/ui";
import type { QuickReply } from "@/lib/quick-replies";

/**
 * Admin → Social → Quick replies.
 *
 * The list is edited locally and written back in ONE PATCH of the whole array
 * (see /api/admin/social/quick-replies), so the order on screen is the order
 * the composer will offer and a half-finished edit never reaches the database.
 *
 * Nothing auto-saves: an accidental keystroke must not rewrite the replies
 * everyone uses, which is why the Save button stays the only way out and the
 * panel says plainly when there are unsaved changes.
 */

type Draft = QuickReply & { id: string };

let seq = 0;
const makeId = () => `qr-${Date.now().toString(36)}-${(seq += 1)}`;

/** Locally state only — ids exist so React can key rows that may repeat text. */
const toDrafts = (items: QuickReply[]): Draft[] =>
  items.map((i) => ({ ...i, id: makeId() }));

export function QuickRepliesClient({ initial }: { initial: QuickReply[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Draft[]>(() => toDrafts(initial));
  const [baseline, setBaseline] = useState<QuickReply[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Add form
  const [newLabel, setNewLabel] = useState("");
  const [newText, setNewText] = useState("");

  // Inline editor (null = nothing being edited)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editText, setEditText] = useState("");

  const strip = (list: Draft[]): QuickReply[] =>
    list.map(({ label, text }) => ({ label: label.trim(), text: text.trim() }));

  const dirty = JSON.stringify(strip(drafts)) !== JSON.stringify(baseline);

  const add = () => {
    const label = newLabel.trim();
    const text = newText.trim();
    if (!label || !text) {
      setError("Give the button a label and the reply some text.");
      return;
    }
    if (label.length > 40) {
      setError("Keep the button label under 40 characters.");
      return;
    }
    if (text.length > 2000) {
      setError("Keep the reply under 2000 characters.");
      return;
    }
    setError(null);
    setSaved(false);
    setDrafts((d) => [...d, { id: makeId(), label, text }]);
    setNewLabel("");
    setNewText("");
  };

  const remove = (id: string) => {
    setSaved(false);
    setError(null);
    setDrafts((d) => d.filter((x) => x.id !== id));
  };

  const move = (index: number, delta: number) => {
    const next = index + delta;
    if (next < 0 || next >= drafts.length) return;
    setSaved(false);
    setError(null);
    setDrafts((d) => {
      const copy = [...d];
      const [moved] = copy.splice(index, 1);
      copy.splice(next, 0, moved);
      return copy;
    });
  };

  const startEdit = (d: Draft) => {
    setEditingId(d.id);
    setEditLabel(d.label);
    setEditText(d.text);
    setError(null);
  };

  const commitEdit = () => {
    const label = editLabel.trim();
    const text = editText.trim();
    if (!label || !text) {
      setError("Both the label and the reply text are needed.");
      return;
    }
    if (label.length > 40) return setError("Keep the button label under 40 characters.");
    if (text.length > 2000) return setError("Keep the reply under 2000 characters.");
    setSaved(false);
    setError(null);
    setDrafts((d) => d.map((x) => (x.id === editingId ? { ...x, label, text } : x)));
    setEditingId(null);
  };

  const save = async () => {
    const clean = strip(drafts);
    if (clean.length === 0) {
      setError("Keep at least one saved reply — an empty list would leave the panel blank.");
      return;
    }
    if (clean.some((c) => !c.label || !c.text)) {
      setError("Every reply needs both a label and text before it can be saved.");
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/social/quick-replies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: clean }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.message || "Could not save the replies.");
      }
      setBaseline(clean);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the replies.");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setDrafts(toDrafts(baseline));
    setEditingId(null);
    setError(null);
    setSaved(false);
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-[0.84rem] text-danger">
          {error}
        </div>
      )}
      {saved && !dirty && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-[0.84rem] text-emerald-300">
          Saved. The composer now offers this list.
        </div>
      )}

      {/* ── add a new reply ─────────────────────────────────────── */}
      <Panel padded className="space-y-3">
        <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-mist-600">
          Add a reply
        </p>
        <div className="grid gap-3 md:grid-cols-[220px_1fr]">
          <Field label="Button label" hint="Short text on the button (max 40)">
            <TextInput
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="যেমন: সালাম"
              maxLength={40}
            />
          </Field>
          <Field label="Reply text" hint="What lands in the composer (max 2000)">
            <TextArea
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="আপনার উত্তরটি লিখুন…"
              maxLength={2000}
            />
          </Field>
        </div>
        <div className="flex justify-end">
          <Btn onClick={add}>
            <Plus size={14} /> Add to list
          </Btn>
        </div>
      </Panel>

      {/* ── the list ────────────────────────────────────────────── */}
      <Panel padded className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-mist-600">
            Saved replies ({drafts.length})
          </p>
          <div className="flex items-center gap-2">
            {dirty && (
              <span className="text-[0.74rem] font-semibold text-gold-300">
                Unsaved changes
              </span>
            )}
            <Btn variant="outline" onClick={reset} disabled={!dirty || busy}>
              Discard
            </Btn>
            <BusyBtn busy={busy} onClick={save} disabled={!dirty}>
              Save changes
            </BusyBtn>
          </div>
        </div>

        {drafts.length === 0 ? (
          <p className="py-6 text-center text-[0.85rem] text-mist-500">
            No saved replies yet — add your first one above.
          </p>
        ) : (
          <ul className="space-y-2">
            {drafts.map((d, i) => (
              <li
                key={d.id}
                className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3"
              >
                {editingId === d.id ? (
                  <div className="space-y-3">
                    <Field label="Button label">
                      <TextInput
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        maxLength={40}
                      />
                    </Field>
                    <Field label="Reply text">
                      <TextArea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        maxLength={2000}
                      />
                    </Field>
                    <div className="flex justify-end gap-2">
                      <Btn variant="outline" onClick={() => setEditingId(null)}>
                        Cancel
                      </Btn>
                      <Btn onClick={commitEdit}>Apply</Btn>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.86rem] font-semibold text-mist-100">{d.label}</p>
                      <p className="mt-0.5 break-words text-[0.8rem] leading-relaxed text-mist-400">
                        {d.text}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <IconBtn
                        label="Move up"
                        disabled={i === 0 || busy}
                        onClick={() => move(i, -1)}
                      >
                        <ChevronUp size={15} />
                      </IconBtn>
                      <IconBtn
                        label="Move down"
                        disabled={i === drafts.length - 1 || busy}
                        onClick={() => move(i, 1)}
                      >
                        <ChevronDown size={15} />
                      </IconBtn>
                      <IconBtn label="Edit" disabled={busy} onClick={() => startEdit(d)}>
                        <Pencil size={15} />
                      </IconBtn>
                      <IconBtn
                        label="Delete"
                        disabled={busy}
                        danger
                        onClick={() => remove(d.id)}
                      >
                        <Trash2 size={15} />
                      </IconBtn>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="flex justify-start">
        <Link
          href="/admin/social"
          className="text-[0.8rem] font-semibold text-gold-400 transition hover:text-gold-300"
        >
          ← Back to inbox
        </Link>
      </div>
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={[
        "rounded-lg border border-white/[0.08] p-2 transition disabled:opacity-30",
        danger
          ? "text-mist-500 hover:border-danger/50 hover:text-danger"
          : "text-mist-400 hover:border-gold-500/40 hover:text-gold-300",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
