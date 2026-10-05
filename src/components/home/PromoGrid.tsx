import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getBanners } from "@/lib/queries";
import { Reveal } from "@/components/ui/Reveal";

/**
 * Promotional banner grid (2×2 on desktop) — managed from
 * Admin → Homepage → Banners.
 */
export async function PromoGrid() {
  const banners = await getBanners("PROMO");
  if (!banners.length) return null;

  return (
    <section className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {banners.map((b, i) => (
          <Reveal key={b.id} delay={Math.min(i * 0.08, 0.3)}>
            <Link
              href={b.link ?? "/search"}
              className="group relative block aspect-[4/3] overflow-hidden rounded-2xl border border-white/[0.07] transition-all duration-400 hover:-translate-y-1 hover:border-gold-500/40 hover:shadow-lift"
            >
              {b.image.endsWith(".svg") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={b.image}
                  alt={b.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={b.image}
                  alt={b.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-ink-950/90 via-ink-950/30 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5">
                <p className="text-[0.62rem] font-bold uppercase tracking-[0.24em] text-gold-400">
                  {b.subtitle ?? "Collection"}
                </p>
                <p className="mt-1 flex items-center gap-1.5 font-display text-lg font-semibold text-white">
                  {b.title}
                  <ArrowRight
                    size={15}
                    className="text-gold-400 transition-transform duration-300 group-hover:translate-x-1.5"
                  />
                </p>
              </div>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
