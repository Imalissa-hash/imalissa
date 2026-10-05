/**
 * ============================================================
 * WhatsApp click-to-chat (no credentials required)
 * ============================================================
 *
 * Builds a `wa.me/<digits>?text=…` link that opens WhatsApp with the message
 * already typed. This is the only honest option without the WhatsApp Business
 * Cloud API: we prepare the message, the admin presses Send.
 *
 * DELIVERY IS MANUAL — nothing here can prove the message arrived, so callers
 * must describe the result as "chat opened", never as "sent". Automatic
 * delivery needs WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID from Meta.
 */

/** Normalise a BD / international mobile to wa.me digits, or null if unusable. */
export function waDigits(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  if (!d) return null;

  if (d.startsWith("880")) return d.length >= 12 && d.length <= 15 ? d : null; // already international
  if (d.startsWith("0")) return d.length === 11 ? `880${d.slice(1)}` : null; // 01712345678 → 8801712345678
  if (d.length === 10 && d.startsWith("1")) return `880${d}`; // 1712345678
  if (d.length >= 11 && d.length <= 15) return d; // other countries
  return null;
}

/** Full click-to-chat URL, or null when the number cannot be used. */
export function waLink(phone: string | null | undefined, text: string): string | null {
  const to = waDigits(phone);
  if (!to) return null;
  // WhatsApp accepts long bodies; keep a safe ceiling for the URL itself.
  const body = (text ?? "").trim().slice(0, 1800);
  return `https://wa.me/${to}?text=${encodeURIComponent(body)}`;
}
