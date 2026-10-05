"use client";

import { cn, formatBDT } from "@/lib/utils";

/**
 * Dependency-free SVG charts (no chart library):
 *  - LineChart  — revenue/sales trend (area fill + hover-free simplicity)
 *  - BarChart   — categorical comparisons
 *  - Donut      — status breakdown
 * All take plain numbers so server components can pass DB aggregates.
 */

export interface SeriesPoint {
  label: string;
  value: number;
}

/* ── Line / area chart ─────────────────────────────────── */
export function LineChart({
  data,
  height = 220,
  formatValue = (v: number) => formatBDT(v),
  className,
}: {
  data: SeriesPoint[];
  height?: number;
  formatValue?: (v: number) => string;
  className?: string;
}) {
  if (data.length === 0) return <ChartEmpty height={height} label="No data yet" />;

  const width = 720;
  const padX = 34;
  const padTop = 18;
  const padBottom = 30;
  const values = data.map((d) => d.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const x = (i: number) =>
    padX + (i * (width - padX * 2)) / Math.max(data.length - 1, 1);
  const y = (v: number) =>
    padTop + (height - padTop - padBottom) * (1 - (v - min) / range);

  const points = data.map((d, i) => `${x(i)},${y(d.value)}`);
  const linePath = `M ${points.join(" L ")}`;
  const areaPath = `${linePath} L ${x(data.length - 1)},${height - padBottom} L ${x(0)},${height - padBottom} Z`;

  const gridLines = 4;

  return (
    <div className={cn("w-full", className)}>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img">
        <defs>
          <linearGradient id="imalissa-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d4af37" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#d4af37" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="imalissa-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#b8860b" />
            <stop offset="100%" stopColor="#f2d06b" />
          </linearGradient>
        </defs>

        {/* grid + y labels */}
        {[...Array(gridLines + 1)].map((_, i) => {
          const gy = padTop + ((height - padTop - padBottom) * i) / gridLines;
          const val = max - (range * i) / gridLines;
          return (
            <g key={i}>
              <line
                x1={padX}
                x2={width - padX}
                y1={gy}
                y2={gy}
                stroke="rgba(255,255,255,0.06)"
                strokeDasharray="3 4"
              />
              <text x={4} y={gy + 4} fontSize="9" fill="rgba(255,255,255,0.35)">
                {compact(val)}
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill="url(#imalissa-area)" />
        <path
          d={linePath}
          fill="none"
          stroke="url(#imalissa-line)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {data.map((d, i) => (
          <circle key={i} cx={x(i)} cy={y(d.value)} r="3" fill="#f2d06b" stroke="#0b0b0d" strokeWidth="1.5">
            <title>{`${d.label}: ${formatValue(d.value)}`}</title>
          </circle>
        ))}

        {/* x labels (thin out when many points) */}
        {data.map((d, i) => {
          const step = Math.ceil(data.length / 8);
          if (i % step !== 0 && i !== data.length - 1) return null;
          return (
            <text
              key={`x-${i}`}
              x={x(i)}
              y={height - 8}
              fontSize="9"
              textAnchor="middle"
              fill="rgba(255,255,255,0.4)"
            >
              {d.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/* ── Bar chart ─────────────────────────────────────────── */
export function BarChart({
  data,
  height = 220,
  horizontal = false,
  formatValue = (v: number) => formatBDT(v),
  className,
}: {
  data: SeriesPoint[];
  height?: number;
  horizontal?: boolean;
  formatValue?: (v: number) => string;
  className?: string;
}) {
  if (data.length === 0) return <ChartEmpty height={height} label="No data yet" />;

  if (horizontal) {
    const max = Math.max(...data.map((d) => d.value), 1);
    return (
      <div className={cn("space-y-3", className)}>
        {data.map((d, i) => (
          <div key={`${d.label}-${i}`}>
            <div className="mb-1 flex items-center justify-between text-[0.78rem]">
              <span className="truncate text-mist-400">{d.label}</span>
              <span className="ml-3 shrink-0 font-semibold text-mist-200">
                {formatValue(d.value)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-gold-600 to-gold-400"
                style={{ width: `${Math.max((d.value / max) * 100, 2)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const width = 720;
  const padBottom = 28;
  const padTop = 16;
  const max = Math.max(...data.map((d) => d.value), 1);
  const barGap = 10;
  const barW = (width - barGap * (data.length + 1)) / data.length;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn("h-auto w-full", className)} role="img">
      {data.map((d, i) => {
        const h = ((height - padTop - padBottom) * d.value) / max;
        const bx = barGap + i * (barW + barGap);
        const by = height - padBottom - h;
        return (
          <g key={`${d.label}-${i}`}>
            <rect
              x={bx}
              y={by}
              width={barW}
              height={Math.max(h, 2)}
              rx="4"
              fill="url(#imalissa-bar)"
              opacity={0.9}
            >
              <title>{`${d.label}: ${formatValue(d.value)}`}</title>
            </rect>
            <text
              x={bx + barW / 2}
              y={height - 9}
              fontSize="9"
              textAnchor="middle"
              fill="rgba(255,255,255,0.4)"
            >
              {d.label}
            </text>
          </g>
        );
      })}
      <defs>
        <linearGradient id="imalissa-bar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f2d06b" />
          <stop offset="100%" stopColor="#9a7513" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ── Donut ─────────────────────────────────────────────── */
const DONUT_COLORS = [
  "#d4af37",
  "#38bdf8",
  "#34d399",
  "#f472b6",
  "#a78bfa",
  "#fb923c",
  "#f87171",
  "#94a3b8",
];

export function Donut({
  data,
  size = 170,
  centerLabel,
  centerValue,
}: {
  data: SeriesPoint[];
  size?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-full border border-dashed border-white/10 text-[0.78rem] text-mist-600"
        style={{ width: size, height: size }}
      >
        No data
      </div>
    );
  }

  const radius = 54;
  const stroke = 16;
  const c = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width={size} height={size} viewBox="0 0 140 140" role="img">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        {data.map((d, i) => {
          const frac = d.value / total;
          const len = frac * c;
          const el = (
            <circle
              key={d.label}
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
              strokeWidth={stroke}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 70 70)"
              strokeLinecap="butt"
            >
              <title>{`${d.label}: ${d.value} (${Math.round(frac * 100)}%)`}</title>
            </circle>
          );
          offset += len;
          return el;
        })}
        {(centerValue || centerLabel) && (
          <>
            <text x="70" y="68" textAnchor="middle" fontSize="18" fontWeight="700" fill="#f5f5f5">
              {centerValue}
            </text>
            <text x="70" y="86" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.45)">
              {centerLabel}
            </text>
          </>
        )}
      </svg>

      <ul className="space-y-1.5 text-[0.8rem]">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
            />
            <span className="text-mist-400">{d.label}</span>
            <span className="font-semibold text-mist-200">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChartEmpty({ height, label }: { height: number; label: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-xl border border-dashed border-white/10 text-[0.82rem] text-mist-600"
      style={{ height }}
    >
      {label}
    </div>
  );
}

function compact(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(Math.round(v));
}
