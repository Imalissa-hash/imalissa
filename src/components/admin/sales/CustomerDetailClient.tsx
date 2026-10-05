"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  MessageCircle,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  Panel,
  Table,
  Th,
  Td,
  Empty,
  BusyBtn,
  ConfirmDialog,
  Modal,
  Field,
  TextInput,
  TextArea,
  Checkbox,
  Btn,
} from "@/components/admin/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatBDT, formatDate, timeAgo } from "@/lib/utils";
import { waLink } from "@/lib/whatsapp";

export interface CustomerAddress {
  id: string;
  type: string;
  fullName: string;
  phone: string;
  division: string;
  district: string;
  area: string;
  fullAddress: string;
  isDefault: boolean;
}

export interface CustomerOrderRow {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  total: number;
  placedAt: string;
}

export interface CustomerDetail {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
  addresses: CustomerAddress[];
  stats: {
    ordersCount: number;
    reviewsCount: number;
    totalSpent: number;
    lastOrderAt: string | null;
  };
  recentOrders: CustomerOrderRow[];
}

interface Notice {
  tone: "ok" | "err";
  text: string;
}

export function CustomerDetailClient({ customer }: { customer: CustomerDetail }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const blocked = customer.status === "BLOCKED";

  const apply = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: blocked ? "ACTIVE" : "BLOCKED" }),
      });
      const json = await res.json().catch(() => ({ ok: false }));
      if (!json.ok) {
        setNotice({ tone: "err", text: json.message ?? "Could not update the customer" });
      } else {
        setNotice({
          tone: "ok",
          text: blocked ? "Customer unblocked" : "Customer blocked",
        });
        router.refresh();
      }
    } catch {
      setNotice({ tone: "err", text: "Network error — please try again" });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  /* ── Change password ────────────────────────────────────
   * Two ways in: type one, or let the server mint a 12-char one.
   * The plaintext comes back once (for display/copy), the DB only ever
   * stores the hash, and it is never written to the audit log.        */
  const [pwOpen, setPwOpen] = useState(false);
  const [pwValue, setPwValue] = useState("");
  const [pwGenerate, setPwGenerate] = useState(false);
  const [pwEmail, setPwEmail] = useState(true);
  const [pwShow, setPwShow] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwResult, setPwResult] = useState<{
    password: string;
    email?: { ok: boolean; message: string };
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const canEmail = Boolean(customer.email);

  const openPassword = () => {
    setPwValue("");
    setPwGenerate(false);
    setPwEmail(canEmail);
    setPwShow(false);
    setPwError(null);
    setPwResult(null);
    setCopied(false);
    setPwOpen(true);
  };

  const copyText = async (value: string) => {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      // HTTP LAN origins have no async clipboard — fall back to the old API.
      try {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const savePassword = async () => {
    if (pwBusy) return;
    setPwError(null);

    if (!pwGenerate && pwValue.length < 8) {
      setPwError("Use 8+ characters with letters and numbers");
      return;
    }

    const payload: Record<string, unknown> = { emailPassword: canEmail && pwEmail };
    if (pwGenerate) payload.generatePassword = true;
    else payload.password = pwValue;

    setPwBusy(true);
    try {
      const res = await fetch(`/api/admin/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({ ok: false }));
      if (!json.ok || !json.data?.password) {
        setPwError(json.message ?? "Could not change the password");
      } else {
        setPwResult({ password: json.data.password, email: json.data.email });
        setLastPassword(json.data.password);
        router.refresh();
      }
    } catch {
      setPwError("Network error — please try again");
    } finally {
      setPwBusy(false);
    }
  };

  /* ── Delete customer ──────────────────────────────────── */
  const [delOpen, setDelOpen] = useState(false);
  const [delTyped, setDelTyped] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);

  const confirmWord = customer.email ?? customer.name;
  const delReady = delTyped.trim() === confirmWord;

  const openDelete = () => {
    setDelTyped("");
    setDelError(null);
    setDelOpen(true);
  };

  const deleteCustomer = async () => {
    if (delBusy || !delReady) return;
    setDelBusy(true);
    setDelError(null);
    try {
      const res = await fetch(`/api/admin/customers/${customer.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({ ok: false }));
      if (!json.ok) {
        setDelError(json.message ?? "Could not delete this customer");
      } else {
        router.push("/admin/customers");
        router.refresh();
        return;
      }
    } catch {
      setDelError("Network error — please try again");
    } finally {
      setDelBusy(false);
    }
  };

  /* ── Message the customer (email / WhatsApp) ─────────────
   * Email   → real SMTP send, success/failure comes from the server.
   * WhatsApp→ pre-filled wa.me chat opened in a new tab; the admin presses
   *           Send there, so the UI says "chat opened", never "sent".
   */
  const hasPhone = Boolean(customer.phone);
  const hasEmail = Boolean(customer.email);
  const [lastPassword, setLastPassword] = useState<string | null>(null);

  const [msgOpen, setMsgOpen] = useState(false);
  const [msgText, setMsgText] = useState("");
  const [msgSubject, setMsgSubject] = useState("");
  const [msgBusy, setMsgBusy] = useState<"email" | "whatsapp" | null>(null);
  const [msgError, setMsgError] = useState<string | null>(null);
  const [msgResult, setMsgResult] = useState<{ tone: "ok" | "info"; text: string; url?: string } | null>(
    null
  );

  const passwordMessage = () =>
    `Hello ${customer.name}, your Imalissa account password has been changed.\n\n` +
    `New password: ${lastPassword ?? "…"}\n\n` +
    `Sign in with your email and this password, then change it from Account → Settings. ` +
    `If you did not expect this, contact us right away.`;

  const openMessage = (preset?: string) => {
    setMsgText(preset ?? "");
    setMsgSubject("");
    setMsgError(null);
    setMsgResult(null);
    setMsgOpen(true);
  };

  const sendMessage = async (channel: "email") => {
    if (msgBusy) return;
    setMsgError(null);
    setMsgResult(null);

    if (!msgText.trim()) {
      setMsgError("Type a message first");
      return;
    }

    setMsgBusy(channel);
    try {
      const res = await fetch(`/api/admin/customers/${customer.id}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: msgText.trim(),
          channel,
          ...(msgSubject.trim() ? { subject: msgSubject.trim() } : {}),
        }),
      });
      const json = await res.json().catch(() => ({ ok: false }));
      if (!json.ok) {
        setMsgError(json.message ?? "Could not send the message");
      } else {
        setMsgResult({ tone: "ok", text: `Email sent to ${json.data.to}` });
      }
    } catch {
      setMsgError("Network error — please try again");
    } finally {
      setMsgBusy(null);
    }
  };

  /**
   * WhatsApp: the chat is opened by a plain <a target="_blank"> so the click
   * stays a real user gesture — `window.open()` after an awaited fetch gets
   * eaten by the popup blocker and nothing happens. The API call here is only
   * for the audit trail (fire-and-forget, `keepalive` so it survives navigation).
   */
  const waHref = waLink(customer.phone, msgText);

  const openWhatsApp = () => {
    if (!waHref) {
      setMsgError(
        customer.phone
          ? "This phone number cannot be used for WhatsApp."
          : "This customer has no phone number on file."
      );
      return;
    }
    setMsgError(null);
    fetch(`/api/admin/customers/${customer.id}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: msgText.trim(), channel: "whatsapp" }),
      keepalive: true,
    }).catch(() => undefined);
    setMsgResult({
      tone: "info",
      text: "WhatsApp opened with your message already typed — press Send there. We cannot confirm delivery without the WhatsApp Business API.",
      url: waHref,
    });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-gold-500/30 bg-gold-500/10 font-display text-xl font-bold text-gold-300">
              {customer.name.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="font-display text-xl font-bold text-mist-50">{customer.name}</h1>
                <StatusBadge status={customer.status} />
              </div>
              <p className="mt-0.5 text-[0.82rem] text-mist-500">
                Joined {formatDate(customer.createdAt, "short")} · {timeAgo(customer.createdAt)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <BusyBtn busy={msgBusy !== null} variant="outline" onClick={() => openMessage()}>
              <MessageCircle size={14} /> Message
            </BusyBtn>
            <BusyBtn busy={pwBusy || busy} variant="outline" onClick={openPassword}>
              <KeyRound size={14} /> Change password
            </BusyBtn>
            <BusyBtn
              busy={busy}
              variant={blocked ? "gold" : "danger"}
              onClick={() => {
                setNotice(null);
                setConfirming(true);
              }}
            >
              {blocked ? (
                <>
                  <ShieldCheck size={14} /> Unblock
                </>
              ) : (
                <>
                  <Ban size={14} /> Block customer
                </>
              )}
            </BusyBtn>
            <BusyBtn busy={delBusy} variant="danger" onClick={openDelete}>
              <Trash2 size={14} /> Delete
            </BusyBtn>
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

        {blocked && (
          <p className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-[0.84rem] text-danger">
            This customer is blocked — they cannot sign in or place orders.
          </p>
        )}
      </Panel>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Orders" value={String(customer.stats.ordersCount)} />
        <StatTile label="Total spent" value={formatBDT(customer.stats.totalSpent)} />
        <StatTile
          label="Last order"
          value={customer.stats.lastOrderAt ? formatDate(customer.stats.lastOrderAt, "short") : "—"}
        />
        <StatTile label="Reviews" value={String(customer.stats.reviewsCount)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Orders */}
        <div className="lg:col-span-2">
          <Panel title="Recent orders" padded={false}>
            {customer.recentOrders.length === 0 ? (
              <div className="p-5">
                <Empty title="No orders from this customer yet" />
              </div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Order</Th>
                    <Th>Placed</Th>
                    <Th>Payment</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {customer.recentOrders.map((o) => (
                    <tr key={o.id} className="transition hover:bg-white/[0.02]">
                      <Td>
                        <Link
                          href={`/admin/orders/${o.id}`}
                          className="font-semibold text-gold-300 transition hover:text-gold-200"
                        >
                          {o.orderNumber}
                        </Link>
                      </Td>
                      <Td className="whitespace-nowrap">{formatDate(o.placedAt, "short")}</Td>
                      <Td>
                        <StatusBadge status={o.paymentStatus} dot={false} />
                      </Td>
                      <Td>
                        <StatusBadge status={o.status} dot={false} />
                      </Td>
                      <Td className="whitespace-nowrap text-right font-semibold text-gold-300">
                        {formatBDT(o.total)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Panel>
        </div>

        {/* Profile */}
        <div className="space-y-5">
          <Panel title="Profile">
            <dl className="space-y-2.5 text-[0.85rem]">
              <div>
                <dt className="text-[0.7rem] uppercase tracking-[0.14em] text-mist-600">Email</dt>
                <dd className="break-all text-mist-200">{customer.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[0.7rem] uppercase tracking-[0.14em] text-mist-600">Phone</dt>
                <dd className="text-mist-200">{customer.phone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[0.7rem] uppercase tracking-[0.14em] text-mist-600">Customer ID</dt>
                <dd className="break-all font-mono text-[0.76rem] text-mist-500">{customer.id}</dd>
              </div>
            </dl>
          </Panel>

          <Panel title={`Saved addresses (${customer.addresses.length})`}>
            {customer.addresses.length === 0 ? (
              <p className="text-[0.82rem] text-mist-600">No saved addresses.</p>
            ) : (
              <ul className="space-y-2">
                {customer.addresses.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 text-[0.8rem]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-mist-200">
                        {a.type}
                        {a.isDefault && (
                          <span className="ml-2 rounded-full border border-gold-500/40 bg-gold-500/10 px-2 py-0.5 text-[0.62rem] uppercase tracking-wide text-gold-300">
                            Default
                          </span>
                        )}
                      </span>
                    </div>
                    <p className="mt-1 text-mist-400">
                      {[a.division, a.district, a.area].filter(Boolean).join(", ")}
                    </p>
                    <p className="text-mist-500">{a.fullAddress}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        title={blocked ? "Unblock customer" : "Block customer"}
        message={
          blocked
            ? `Unblock ${customer.name}? They will be able to sign in and place orders again.`
            : `Block ${customer.name}? They will no longer be able to sign in or place orders. This is recorded in the audit log.`
        }
        confirmLabel={blocked ? "Unblock" : "Block"}
        busy={busy}
        onConfirm={apply}
        onCancel={() => setConfirming(false)}
      />

      {/* ── Change password ─────────────────────────────── */}
      <Modal
        open={pwOpen}
        onClose={() => !pwBusy && setPwOpen(false)}
        title="Change customer password"
      >
        {pwResult ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-[0.85rem] text-success">
              <CheckCircle2 size={15} />
              Password changed — the customer has been signed out on every device.
            </div>

            <div className="rounded-xl border border-gold-500/30 bg-gold-500/[0.07] p-4">
              <p className="text-[0.7rem] uppercase tracking-[0.14em] text-mist-600">New password</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-[0.95rem] tracking-[0.1em] text-gold-200">
                  {pwResult.password}
                </code>
                <Btn variant="outline" onClick={() => copyText(pwResult.password)}>
                  {copied ? (
                    <>
                      <Check size={14} /> Copied
                    </>
                  ) : (
                    <>
                      <Copy size={14} /> Copy
                    </>
                  )}
                </Btn>
              </div>
              <p className="mt-2 text-[0.75rem] leading-relaxed text-mist-600">
                Visible only right now — the account stores a hash, so this password can never be
                shown again. Save it somewhere safe before closing.
              </p>
            </div>

            {pwResult.email && (
              <div
                className={
                  pwResult.email.ok
                    ? "rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-[0.84rem] text-success"
                    : "rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-[0.84rem] text-danger"
                }
              >
                {pwResult.email.message}
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              {hasPhone && (
                <Btn
                  variant="outline"
                  onClick={() => {
                    setPwOpen(false);
                    openMessage(passwordMessage());
                  }}
                >
                  <MessageCircle size={14} /> Send on WhatsApp
                </Btn>
              )}
              <Btn variant="gold" onClick={() => setPwOpen(false)}>
                Done
              </Btn>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {pwError && (
              <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-[0.84rem] text-danger">
                {pwError}
              </div>
            )}

            <Field
              label="New password"
              hint={
                pwGenerate
                  ? "The server will mint a 12-character password — you will see it after saving."
                  : "8+ characters with letters and numbers."
              }
            >
              <div className="relative">
                <TextInput
                  type={pwShow ? "text" : "password"}
                  className="pr-11"
                  value={pwValue}
                  disabled={pwGenerate}
                  onChange={(e) => setPwValue(e.target.value)}
                  placeholder="8+ characters, letters and numbers"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setPwShow((s) => !s)}
                  aria-label={pwShow ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-mist-500 transition hover:text-gold-400"
                >
                  {pwShow ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>

            <Checkbox
              label="Generate a strong password for me"
              checked={pwGenerate}
              onChange={setPwGenerate}
            />

            <div className="space-y-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3">
              <div className="flex items-center gap-2 text-[0.8rem] text-mist-400">
                <Mail size={14} className="text-gold-500/80" />
                Email the new password to the customer
              </div>
              {canEmail ? (
                <Checkbox label={`Send to ${customer.email}`} checked={pwEmail} onChange={setPwEmail} />
              ) : (
                <p className="text-[0.78rem] text-mist-600">
                  No email address on file — it cannot be emailed.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Btn variant="outline" onClick={() => setPwOpen(false)}>
                Cancel
              </Btn>
              <BusyBtn busy={pwBusy} variant="gold" onClick={savePassword}>
                <KeyRound size={14} /> Save password
              </BusyBtn>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Delete customer ─────────────────────────────── */}
      <Modal
        open={delOpen}
        onClose={() => !delBusy && setDelOpen(false)}
        title="Delete customer permanently"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-[0.84rem] leading-relaxed text-danger">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle size={15} />
              This cannot be undone
            </div>
            <p className="mt-1.5">
              Removes the account with its addresses, cart, wishlist, reviews, sessions and
              notifications. Customers who have orders cannot be deleted — their order history is
              kept, so block them instead.
            </p>
          </div>

          {customer.stats.ordersCount > 0 && (
            <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-[0.84rem] text-amber-200">
              This customer has <strong>{customer.stats.ordersCount}</strong> order(s) — deletion
              will be refused. Use “Block customer” instead.
            </p>
          )}

          {delError && (
            <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-[0.84rem] text-danger">
              {delError}
            </div>
          )}

          <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3 text-[0.82rem] text-mist-300">
            <span>
              <span className="text-mist-600">Orders:</span> {customer.stats.ordersCount}
            </span>
            <span>
              <span className="text-mist-600">Reviews:</span> {customer.stats.reviewsCount}
            </span>
            <span>
              <span className="text-mist-600">Total spent:</span>{" "}
              {formatBDT(customer.stats.totalSpent)}
            </span>
          </div>

          <Field label={`Type ${confirmWord} to confirm`}>
            <TextInput
              value={delTyped}
              onChange={(e) => setDelTyped(e.target.value)}
              placeholder={confirmWord}
              autoComplete="off"
            />
          </Field>

          <div className="flex justify-end gap-2">
            <Btn variant="outline" onClick={() => setDelOpen(false)}>
              Cancel
            </Btn>
            <BusyBtn busy={delBusy} variant="danger" disabled={!delReady} onClick={deleteCustomer}>
              <Trash2 size={14} /> Delete forever
            </BusyBtn>
          </div>
        </div>
      </Modal>

      {/* ── Message the customer ────────────────────────── */}
      <Modal open={msgOpen} onClose={() => !msgBusy && setMsgOpen(false)} title="Message customer">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3 text-[0.8rem]">
            <span>
              <span className="text-mist-600">Email:</span>{" "}
              <span className="break-all text-mist-300">{customer.email ?? "—"}</span>
            </span>
            <span>
              <span className="text-mist-600">WhatsApp:</span>{" "}
              <span className="text-mist-300">{customer.phone ?? "—"}</span>
            </span>
          </div>

          {msgError && (
            <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-[0.84rem] text-danger">
              {msgError}
            </div>
          )}

          {msgResult && (
            <div
              className={
                msgResult.tone === "ok"
                  ? "rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-[0.84rem] leading-relaxed text-success"
                  : "rounded-xl border border-gold-500/30 bg-gold-500/[0.07] px-4 py-3 text-[0.84rem] leading-relaxed text-gold-200"
              }
            >
              {msgResult.text}{" "}
              {msgResult.url && (
                <a
                  href={msgResult.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold underline"
                >
                  Open the chat again
                </a>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!lastPassword}
              onClick={() => {
                setMsgSubject("Your Imalissa password has been changed");
                setMsgText(passwordMessage());
              }}
              className={
                lastPassword
                  ? "rounded-full border border-gold-500/40 bg-gold-500/[0.1] px-3.5 py-1.5 text-[0.78rem] text-gold-300 transition hover:bg-gold-500/[0.18]"
                  : "cursor-not-allowed rounded-full border border-white/10 px-3.5 py-1.5 text-[0.78rem] text-mist-600"
              }
              title={lastPassword ? "" : "Set a password in this session first"}
            >
              Password changed
            </button>
            <button
              type="button"
              onClick={() => setMsgText(`Hello ${customer.name}, `)}
              className="rounded-full border border-white/12 px-3.5 py-1.5 text-[0.78rem] text-mist-300 transition hover:border-gold-500/40 hover:text-gold-300"
            >
              Greeting
            </button>
          </div>

          <Field label="Subject (email only)">
            <TextInput
              value={msgSubject}
              onChange={(e) => setMsgSubject(e.target.value)}
              placeholder="Message from Imalissa"
            />
          </Field>

          <Field label="Message" hint="WhatsApp opens with this text already typed — you press Send there.">
            <TextArea
              value={msgText}
              onChange={(e) => setMsgText(e.target.value)}
              placeholder="Type your message…"
              maxLength={1500}
            />
          </Field>

          <div className="flex flex-wrap justify-end gap-2">
            <a
              href={waHref ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                if (!waHref || !msgText.trim()) {
                  e.preventDefault();
                  return;
                }
                openWhatsApp();
              }}
              className={
                waHref && msgText.trim()
                  ? "inline-flex items-center justify-center gap-2 rounded-xl border border-white/12 px-4 py-2.5 text-[0.84rem] font-semibold text-mist-300 transition hover:border-gold-500/40 hover:text-gold-300"
                  : "pointer-events-none inline-flex items-center justify-center gap-2 rounded-xl border border-white/12 px-4 py-2.5 text-[0.84rem] font-semibold text-mist-300 opacity-50"
              }
            >
              <MessageCircle size={14} /> {hasPhone ? "Open WhatsApp" : "No phone number"}
            </a>
            <BusyBtn
              busy={msgBusy === "email"}
              variant="gold"
              disabled={!hasEmail || !msgText.trim()}
              onClick={() => sendMessage("email")}
            >
              <Send size={14} /> {hasEmail ? "Send email" : "No email"}
            </BusyBtn>
          </div>

          {!hasPhone && (
            <p className="text-[0.76rem] text-mist-600">
              Add a phone number to this customer to use WhatsApp.
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
      <p className="text-[0.74rem] uppercase tracking-[0.14em] text-mist-600">{label}</p>
      <p className="mt-1.5 truncate font-display text-xl font-bold text-mist-50">{value}</p>
    </div>
  );
}
