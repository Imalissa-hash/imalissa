"use client";

import { useState } from "react";
import { Send, CheckCircle2 } from "lucide-react";

export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) {
      setState("error");
      setMessage("Please enter a valid email");
      return;
    }
    setState("loading");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (json.ok) {
        setState("done");
        setMessage("You're on the list — welcome to Imalissa!");
        setEmail("");
      } else {
        setState("error");
        setMessage(json.message ?? "Something went wrong");
      }
    } catch {
      setState("error");
      setMessage("Network error — please try again");
    }
  };

  if (state === "done") {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2.5 text-[0.8rem] text-success">
        <CheckCircle2 size={15} /> {message}
      </p>
    );
  }

  return (
    <div>
      <form onSubmit={submit} className="flex overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] transition focus-within:border-gold-500/60">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email address"
          aria-label="Email address"
          className="w-full bg-transparent px-3 py-2.5 text-[0.84rem] text-mist-50 placeholder:text-mist-600 focus:outline-none"
        />
        <button
          type="submit"
          disabled={state === "loading"}
          aria-label="Subscribe"
          className="flex items-center gap-1.5 bg-gradient-to-r from-gold-500 to-gold-600 px-4 text-[0.78rem] font-semibold text-ink-950 transition hover:brightness-110 disabled:opacity-60"
        >
          {state === "loading" ? "…" : <Send size={14} />}
        </button>
      </form>
      {state === "error" && <p className="mt-1.5 text-[0.72rem] text-danger">{message}</p>}
    </div>
  );
}
