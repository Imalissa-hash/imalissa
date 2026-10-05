import { SearchX } from "lucide-react";
import Link from "next/link";

export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
  icon,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-gold-500/25 bg-gold-500/[0.06] text-gold-500/80">
        {icon ?? <SearchX size={26} />}
      </div>
      <div>
        <p className="font-display text-lg text-mist-100">{title}</p>
        {description && <p className="mt-1 max-w-md text-sm text-mist-500">{description}</p>}
      </div>
      {actionLabel && actionHref && (
        <Link href={actionHref} className="btn-gold rounded-xl px-6 py-2.5 text-sm">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
