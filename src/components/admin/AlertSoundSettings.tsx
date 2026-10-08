"use client";

import { useEffect, useState } from "react";
import { Volume2, Play } from "lucide-react";
import {
  ALERT_SOUNDS,
  loadAlertSound,
  playAlertSound,
  primeAlertAudio,
  saveAlertSound,
} from "@/lib/alert-sound";

/**
 * Alert-sound picker — used in the bell dropdown (inline) and as a card
 * on the System Log page. Picking a sound previews it IMMEDIATELY, so
 * there is instant feedback that audio works on this device.
 */
export function AlertSoundSettings({ inline = false }: { inline?: boolean }) {
  const [sound, setSound] = useState<string>("chime");

  useEffect(() => {
    setSound(loadAlertSound());
  }, []);

  const choose = (id: string) => {
    setSound(id);
    saveAlertSound(id);
    primeAlertAudio();
    void playAlertSound(id, "New order received"); // instant preview
  };

  const test = () => {
    primeAlertAudio();
    void playAlertSound(sound, "Test — a new order has just arrived");
  };

  const picker = (
    <div className="flex items-center gap-2">
      <label
        className="flex min-w-0 items-center gap-1.5 text-[0.74rem] text-mist-500"
        title="Sound played when a new order or message arrives"
      >
        <Volume2 size={12} className="shrink-0" />
        <span className="sr-only">Alert sound</span>
        <select
          value={sound}
          onChange={(e) => choose(e.target.value)}
          aria-label="Alert sound"
          className="max-w-[7rem] rounded-md border border-white/10 bg-ink-950 px-1.5 py-1 text-[0.74rem] text-mist-300 outline-none transition focus:border-gold-500/40"
        >
          {ALERT_SOUNDS.map((s) => (
            <option key={s.id} value={s.id} title={s.hint}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <button
        onClick={test}
        className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[0.72rem] text-mist-400 transition hover:border-gold-500/40 hover:text-gold-300"
      >
        <Play size={10} /> Test
      </button>
    </div>
  );

  if (inline) {
    return (
      <div className="flex items-center justify-between gap-2 border-t border-white/[0.07] px-3.5 py-2.5">
        {picker}
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.84rem] font-semibold text-mist-100">Alert sound</p>
          <p className="mt-0.5 text-[0.75rem] leading-relaxed text-mist-500">
            Plays when a new order or message arrives while any admin page is open — and once when
            you open the panel with alerts already waiting.{" "}
            <span className="text-mist-400">Voice</span> speaks what arrived. Pick a sound to hear
            it instantly.
          </p>
        </div>
        {picker}
      </div>
    </div>
  );
}
