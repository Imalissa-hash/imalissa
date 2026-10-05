import Link from "next/link";
import { ArrowRight, BadgeCheck, RefreshCcw, ShieldCheck, Truck, Wallet } from "lucide-react";
import { getSettings } from "@/lib/settings";
import { Reveal } from "@/components/ui/Reveal";
import { NewsletterForm } from "@/components/layout/NewsletterForm";

const iconMap = {
  shield: ShieldCheck,
  wallet: Wallet,
  truck: Truck,
  refresh: RefreshCcw,
};

/**
 * Trust/service section + newsletter band (home page bottom).
 */
export async function TrustAndNewsletter() {
  const settings = await getSettings();

  return (
    <>
      {/* Trust */}
      <section className="relative overflow-hidden border-y border-gold-500/15 bg-ink-900/60">
        <div className="absolute -left-24 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-gold-500/[0.06] blur-3xl" />
        <div className="absolute -right-24 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-gold-500/[0.06] blur-3xl" />
        <div className="mx-auto grid max-w-[1400px] gap-8 px-6 py-14 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
          {settings.trust.map((item, i) => {
            const Icon = iconMap[(item.icon as keyof typeof iconMap) ?? "shield"] ?? ShieldCheck;
            return (
              <Reveal key={i} delay={i * 0.08}>
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-gold-500/30 bg-gradient-to-br from-gold-500/15 to-transparent shadow-[0_0_24px_-10px_rgba(212,175,55,0.5)]">
                    <Icon size={24} className="text-gold-400" />
                  </div>
                  <div>
                    <p className="flex items-center gap-1.5 font-display text-[1.05rem] font-semibold text-mist-50">
                      {item.title}
                      <BadgeCheck size={14} className="text-gold-500" />
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-mist-400">{item.text}</p>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* Newsletter band */}
      <section className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-gold-500/25 bg-gradient-to-br from-ink-800 via-ink-900 to-ink-950 px-6 py-14 text-center sm:px-16">
            <div className="absolute -top-24 left-1/2 h-56 w-[480px] -translate-x-1/2 rounded-full bg-gold-500/10 blur-3xl" />
            <div className="pointer-events-none absolute inset-0 opacity-[0.05]" style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, #d4af37 1px, transparent 0)",
              backgroundSize: "28px 28px",
            }} />
            <div className="relative mx-auto max-w-2xl">
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.32em] text-gold-400">
                Stay in the loop
              </p>
              <h2 className="mt-3 font-display text-3xl font-bold text-white sm:text-4xl">
                Get <span className="text-gold-gradient">exclusive deals</span> before anyone else
              </h2>
              <p className="mt-3 text-sm text-mist-400 sm:text-base">
                Subscribe to the Imalissa newsletter — new arrivals, members-only offers and
                price drops, straight to your inbox.
              </p>
              <div className="mx-auto mt-7 max-w-md">
                <NewsletterForm />
              </div>
              <p className="mt-4 flex items-center justify-center gap-1.5 text-[0.72rem] text-mist-600">
                <ArrowRight size={12} className="text-gold-500" />
                Use code <span className="font-semibold text-gold-300">WELCOME10</span> for 10% off
                your first order
              </p>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
