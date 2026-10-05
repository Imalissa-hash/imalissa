import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "./Reveal";

/**
 * Section heading — serif title + gold rule + optional "view all" link.
 */
export function SectionHeading({
  title,
  subtitle,
  href,
  linkLabel = "View all",
  align = "left",
  id,
}: {
  title: string;
  subtitle?: string | null;
  href?: string;
  linkLabel?: string;
  align?: "left" | "center";
  id?: string;
}) {
  return (
    <Reveal className={`mb-6 flex items-end justify-between gap-4 ${align === "center" ? "flex-col items-center text-center" : ""}`} >
      <div className={align === "center" ? "flex flex-col items-center" : ""}>
        <h2 id={id} className="font-display text-2xl font-semibold tracking-tight text-mist-50 sm:text-[1.7rem]">
          {title}
          <span className="mt-2 block h-[2px] w-14 bg-gradient-to-r from-gold-500 to-gold-700" style={align === "center" ? { marginInline: "auto" } : undefined} />
        </h2>
        {subtitle && <p className="mt-2.5 max-w-2xl text-sm text-mist-400">{subtitle}</p>}
      </div>
      {href && (
        <Link
          href={href}
          className="group hidden shrink-0 items-center gap-1.5 text-[0.82rem] font-medium text-gold-400 transition hover:text-gold-300 sm:flex"
        >
          {linkLabel}
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
        </Link>
      )}
    </Reveal>
  );
}
