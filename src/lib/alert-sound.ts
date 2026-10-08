/**
 * Notification sounds for the admin alert bell — synthesized in the
 * browser with the Web Audio API (or spoken via SpeechSynthesis), so no
 * audio files are fetched and nothing can ever 404 or slow the page down.
 *
 * Each browser remembers its own choice in localStorage
 * ("imalissa.alertSound"); admins on different devices can pick
 * different sounds.
 */

export interface AlertSoundOption {
  id: string;
  label: string;
  /** One-line description shown as a tooltip on the option. */
  hint: string;
}

export const ALERT_SOUNDS: AlertSoundOption[] = [
  { id: "chime", label: "Chime", hint: "Two rising notes" },
  { id: "bell", label: "Bell", hint: "Single bell with echo" },
  { id: "pop", label: "Pop", hint: "Short double blip" },
  { id: "voice", label: "Voice", hint: "Speaks what just arrived" },
  { id: "none", label: "Silent", hint: "No sound at all" },
];

export const ALERT_SOUND_STORAGE_KEY = "imalissa.alertSound";
const DEFAULT_SOUND = "chime";

/** Read this browser's saved sound choice (defaults to "chime"). */
export function loadAlertSound(): string {
  if (typeof window === "undefined") return DEFAULT_SOUND;
  try {
    const saved = window.localStorage.getItem(ALERT_SOUND_STORAGE_KEY);
    return ALERT_SOUNDS.some((s) => s.id === saved) ? (saved as string) : DEFAULT_SOUND;
  } catch {
    return DEFAULT_SOUND;
  }
}

/** Remember this browser's sound choice. */
export function saveAlertSound(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ALERT_SOUND_STORAGE_KEY, id);
  } catch {
    /* private mode / quota — the choice still applies for this session */
  }
}

/* ── Audio unlock ─────────────────────────────────────────────────────
 * Browsers keep Web Audio suspended until the user interacts at least
 * once. primeAlertAudio() creates the context early and resumes it on
 * the first click/keypress, so sounds that arrive later actually play.
 * (If an alert lands before ANY interaction, the browser policy wins
 * and we stay silent — there is no way around that.)
 * ------------------------------------------------------------------- */

let ctx: AudioContext | null = null;
let primed = false;

export function primeAlertAudio(): void {
  if (primed || typeof window === "undefined") return;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  primed = true;
  try {
    ctx = new AC();
  } catch {
    return;
  }
  const unlock = () => {
    void ctx?.resume().catch(() => undefined);
  };
  window.addEventListener("pointerdown", unlock, { once: true, capture: true });
  window.addEventListener("keydown", unlock, { once: true, capture: true });
}

/** One synthesized note: clean attack, smooth decay, no files involved. */
function tone(freq: number, start: number, dur: number, peak = 0.18, type: OscillatorType = "sine") {
  if (!ctx) return;
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/**
 * Play the chosen alert sound.
 *
 * @param soundId one of ALERT_SOUNDS ("none" = silent)
 * @param message for the "voice" option: what should be said — pass the
 *                title of the alert that just arrived ("New order
 *                IMAL-2026-000042") so the admin hears what happened
 */
export async function playAlertSound(soundId: string, message?: string): Promise<void> {
  if (soundId === "none" || typeof window === "undefined") return;

  if (soundId === "voice") {
    if (!("speechSynthesis" in window)) return; // engine missing → stay honest & silent
    const text = (message || "New alert").trim();
    try {
      window.speechSynthesis.cancel(); // don't stack announcements
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "en-US";
      utter.rate = 1.05;
      utter.pitch = 1;
      window.speechSynthesis.speak(utter);
    } catch {
      /* some browsers block TTS — nothing else to do */
    }
    return;
  }

  primeAlertAudio();
  if (!ctx) return;
  try {
    await ctx.resume();
  } catch {
    return; // no user gesture yet — browser policy keeps us silent
  }
  if (ctx.state !== "running") return;

  switch (soundId) {
    case "chime":
      tone(880, 0, 0.35); // A5
      tone(1318.51, 0.18, 0.7); // E6 — rising, "something arrived"
      break;
    case "bell":
      tone(1046.5, 0, 1.2, 0.16); // C6 fundamental
      tone(1567.98, 0, 0.9, 0.07); // G6 partial
      tone(2093, 0, 0.5, 0.04); // C7 shimmer
      break;
    case "pop":
      tone(660, 0, 0.14, 0.2, "triangle"); // quick, attention-grabbing
      tone(987.77, 0.08, 0.18, 0.16, "triangle");
      break;
    default:
      tone(880, 0, 0.4);
      break;
  }
}
