import { cn } from "@/lib/utils";

/**
 * Brand/social glyphs as inline SVG.
 * lucide-react v1 removed brand icons, so these are hand-drawn to match
 * the icon sizing/stroke conventions used across the site.
 */

interface IconProps {
  size?: number;
  className?: string;
}

function base(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "currentColor",
    className: cn("shrink-0", className),
    "aria-hidden": true as const,
  };
}

export function Facebook({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M14.03 21v-8.02h2.7l.4-3.13h-3.1V7.85c0-.9.25-1.52 1.55-1.52h1.66V3.55c-.29-.04-1.27-.12-2.41-.12-2.39 0-4.03 1.46-4.03 4.14v2.28H8.05v3.13h2.75V21h3.23Z" />
    </svg>
  );
}

export function Instagram({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)} fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Youtube({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M21.6 7.2a2.5 2.5 0 0 0-1.76-1.77C18.28 5 12 5 12 5s-6.28 0-7.84.43A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.76 1.77C5.72 19 12 19 12 19s6.28 0 7.84-.43a2.5 2.5 0 0 0 1.76-1.77A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15.2V8.8L15.5 12 10 15.2Z" />
    </svg>
  );
}

/** X (formerly Twitter). */
export function Twitter({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M17.53 3h3.02l-6.6 7.54L21.75 21h-5.9l-4.62-6.04L5.94 21H2.92l7.06-8.07L2.4 3h6.05l4.18 5.52L17.53 3Zm-1.06 16.2h1.67L7.6 4.72H5.8l10.67 14.48Z" />
    </svg>
  );
}
