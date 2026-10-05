"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface HeroBanner {
  id: string;
  title: string;
  subtitle: string | null;
  image: string;
  link: string | null;
  buttonText: string | null;
}

/**
 * Full-width hero carousel — soft ken-burns on the artwork, content
 * crossfades, gold progress indicators, auto-advances every 6s and pauses
 * on hover. Uses native <img> because our artwork is SVG (crisp at any
 * size, no optimizer overhead).
 */
export function HeroCarousel({ banners }: { banners: HeroBanner[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = banners.length;

  const go = useCallback(
    (dir: 1 | -1) => setIndex((i) => (i + dir + count) % count),
    [count]
  );

  useEffect(() => {
    if (count <= 1 || paused) return;
    const t = setInterval(() => go(1), 6000);
    return () => clearInterval(t);
  }, [count, paused, go, index]);

  if (!count) return null;
  const banner = banners[index];

  return (
    <section
      className="relative h-[420px] w-full overflow-hidden bg-ink-900 sm:h-[480px] lg:h-[600px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-label="Promotions"
    >
      <AnimatePresence mode="popLayout">
        <motion.div
          key={banner.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: "easeInOut" }}
          className="absolute inset-0"
        >
          {banner.image.endsWith(".svg") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={banner.image}
              alt={banner.title}
              fetchPriority={index === 0 ? "high" : "low"}
              className="h-full w-full animate-kb object-cover"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={banner.image} alt={banner.title} className="h-full w-full object-cover" />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Left readability gradient + animated content on mobile only (desktop art has its own text) */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-ink-950/85 via-ink-950/45 to-transparent lg:from-ink-950/70 lg:via-ink-950/10" />

      <div className="absolute inset-0 flex items-center">
        <div className="mx-auto w-full max-w-[1400px] px-6 sm:px-10 lg:px-16">
          <AnimatePresence mode="wait">
            <motion.div
              key={`content-${banner.id}`}
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -18 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="max-w-2xl"
            >
              <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-gold-500/40 bg-gold-500/10 px-4 py-1.5 text-[0.68rem] font-bold uppercase tracking-[0.28em] text-gold-300">
                <span className="h-1.5 w-1.5 rounded-full bg-gold-400" />
                Imalissa Exclusive
              </p>
              <h1 className="font-display text-[2.4rem] font-bold leading-[1.05] text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.9)] sm:text-6xl lg:text-[4.2rem]">
                {banner.title}
              </h1>
              {banner.subtitle && (
                <p className="mt-4 max-w-xl text-base text-mist-200 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] sm:text-lg">
                  {banner.subtitle}
                </p>
              )}
              {banner.link && (
                <Link
                  href={banner.link}
                  className="btn-gold mt-7 inline-flex items-center gap-2 rounded-xl px-8 py-3.5 text-sm uppercase tracking-[0.12em]"
                >
                  {banner.buttonText ?? "Shop Now"}
                  <ChevronRight size={16} />
                </Link>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Arrows */}
      {count > 1 && (
        <>
          <button
            onClick={() => go(-1)}
            aria-label="Previous slide"
            className="absolute left-3 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-ink-950/60 text-mist-200 backdrop-blur transition hover:border-gold-500/50 hover:text-gold-300 sm:flex"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={() => go(1)}
            aria-label="Next slide"
            className="absolute right-3 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-ink-950/60 text-mist-200 backdrop-blur transition hover:border-gold-500/50 hover:text-gold-300 sm:flex"
          >
            <ChevronRight size={20} />
          </button>
        </>
      )}

      {/* Progress indicators */}
      {count > 1 && (
        <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 gap-2.5">
          {banners.map((b, i) => (
            <button
              key={b.id}
              onClick={() => setIndex(i)}
              aria-label={`Go to slide ${i + 1}`}
              className="group relative h-1.5 overflow-hidden rounded-full bg-white/25 transition-all"
              style={{ width: i === index ? 44 : 18 }}
            >
              {i === index && (
                <motion.span
                  key={`${b.id}-${paused}`}
                  initial={{ width: 0 }}
                  animate={{ width: paused ? "100%" : "100%" }}
                  transition={{ duration: paused ? 0.3 : 6, ease: "linear" }}
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-gold-400 to-gold-600"
                />
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
