import { Star, StarHalf } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Star rating display — works in server and client components.
 */
export function Rating({
  value,
  count,
  size = 13,
  showValue = false,
  className,
}: {
  value: number;
  count?: number;
  size?: number;
  showValue?: boolean;
  className?: string;
}) {
  const rounded = Math.round(value * 2) / 2;
  const stars = [1, 2, 3, 4, 5].map((i) => {
    if (rounded >= i) return "full";
    if (rounded >= i - 0.5) return "half";
    return "empty";
  });

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <div className="flex items-center gap-0.5" aria-label={`Rating ${value} out of 5`}>
        {stars.map((kind, idx) => (
          <span key={idx} className="relative inline-flex">
            <Star
              size={size}
              className={kind === "empty" ? "text-mist-700" : "text-gold-500"}
              fill={kind === "full" ? "currentColor" : "none"}
              strokeWidth={1.5}
            />
            {kind === "half" && (
              <span className="absolute inset-0 w-1/2 overflow-hidden">
                <Star size={size} className="text-gold-500" fill="currentColor" strokeWidth={1.5} />
              </span>
            )}
          </span>
        ))}
      </div>
      {showValue && <span className="text-[0.72rem] font-medium text-mist-300">{value.toFixed(1)}</span>}
      {count !== undefined && (
        <span className="text-[0.7rem] text-mist-500">({count})</span>
      )}
    </div>
  );
}
