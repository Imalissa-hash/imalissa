import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Imalissa wordmark logo — serif type + gold diamond monogram.
 * Server component (no client JS).
 */
export function Logo({
  className,
  compact = false,
  linked = true,
  logoSrc,
}: {
  className?: string;
  compact?: boolean;
  /**
   * false = render the wordmark WITHOUT its own anchor — use it when a parent
   * already wraps the logo in a link (an <a> inside an <a> is invalid HTML and
   * throws a React hydration error).
   */
  linked?: boolean;
  /**
   * Admin-uploaded site logo (Settings → Brand). When set it is drawn in
   * place of the built-in gold monogram, so it sits beside the site name.
   * Empty/undefined keeps the default monogram.
   */
  logoSrc?: string;
}) {
  const inner = (
    <>
      {logoSrc ? (
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[9px] border border-gold-500/40 bg-white/[0.06]">
          {/* Plain <img>: runtime-uploaded files must work for any URL, and
              the logo is served by /uploads with its own cache headers. */}
          <img src={logoSrc} alt="" className="h-full w-full object-contain p-1" />
        </span>
      ) : (
        <span className="relative flex h-9 w-9 items-center justify-center">
          <span className="absolute inset-0 rotate-45 rounded-[9px] border border-gold-500/70 bg-gradient-to-br from-gold-500/25 to-transparent transition-transform duration-500 group-hover:rotate-[135deg]" />
          <span className="relative font-display text-lg font-bold text-gold-gradient leading-none">
            I
          </span>
        </span>
      )}
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="font-display text-[1.35rem] font-bold tracking-[0.14em] text-gold-gradient">
            IMALISSA
          </span>
          <span className="mt-0.5 text-[0.56rem] font-medium uppercase tracking-[0.42em] text-mist-400">
            Premium Store
          </span>
        </span>
      )}
    </>
  );

  if (!linked) {
    return (
      <span className={cn("group inline-flex items-center gap-2.5 select-none", className)}>
        {inner}
      </span>
    );
  }

  return (
    <Link
      href="/"
      aria-label="Imalissa — home"
      className={cn("group inline-flex items-center gap-2.5 select-none", className)}
    >
      {inner}
    </Link>
  );
}
