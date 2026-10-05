"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Clock, TrendingUp, X, CornerDownLeft } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface Suggestion {
  type: "product" | "category" | "brand";
  label: string;
  sublabel?: string;
  href: string;
  image?: string | null;
}

const RECENT_KEY = "imalissa_recent_searches";

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function pushRecent(q: string) {
  try {
    const list = [q, ...loadRecent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
}

export function SearchBar({
  initialQuery = "",
  compact = false,
  autoFocus = false,
  onNavigate,
}: {
  initialQuery?: string;
  compact?: boolean;
  autoFocus?: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setRecent(loadRecent());
  }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Debounced suggestion fetch.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(query.trim())}`);
        const json = await res.json();
        setSuggestions(json.ok ? (json.data as Suggestion[]) : []);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const submit = (value?: string) => {
    const q = (value ?? query).trim();
    if (!q) return;
    pushRecent(q);
    setRecent(loadRecent());
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
    onNavigate?.();
  };

  const removeRecent = (item: string) => {
    const list = recent.filter((r) => r !== item);
    setRecent(list);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    } catch {
      /* ignore */
    }
  };

  const rows: { key: string; node: React.ReactNode }[] = [];
  if (query.trim().length < 2 && recent.length) {
    rows.push({
      key: "recent-header",
      node: (
        <div className="flex items-center justify-between px-4 pt-3 pb-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-mist-500">
          Recent searches
        </div>
      ),
    });
    recent.forEach((r) =>
      rows.push({
        key: `recent-${r}`,
        node: (
          <button
            key={`recent-${r}`}
            type="button"
            onClick={() => submit(r)}
            className="group flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-white/[0.04]"
          >
            <Clock size={14} className="text-mist-500 group-hover:text-gold-400" />
            <span className="flex-1 text-sm text-mist-200">{r}</span>
            <span
              role="button"
              aria-label={`Remove ${r}`}
              onClick={(e) => {
                e.stopPropagation();
                removeRecent(r);
              }}
              className="text-mist-600 transition hover:text-danger"
            >
              <X size={13} />
            </span>
          </button>
        ),
      })
    );
  }

  if (suggestions.length) {
    suggestions.forEach((s, i) =>
      rows.push({
        key: `s-${s.type}-${s.href}-${i}`,
        node: (
          <button
            type="button"
            onClick={() => {
              pushRecent(query.trim());
              setOpen(false);
              router.push(s.href);
              onNavigate?.();
            }}
            onMouseEnter={() => setActiveIndex(i)}
            className={cn(
              "group flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-white/[0.04]",
              activeIndex === i && "bg-gold-500/10"
            )}
          >
            {s.image ? (
              <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-ink-700">
                {s.image.endsWith(".svg") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Image src={s.image} alt="" fill sizes="36px" className="object-cover" />
                )}
              </span>
            ) : s.type === "product" ? (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gold-500/20 bg-gold-500/10 text-gold-400">
                <TrendingUp size={14} />
              </span>
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-mist-300 text-[0.6rem] font-bold uppercase">
                {s.type[0]}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-mist-100">{s.label}</span>
              {s.sublabel && (
                <span className="block text-[0.7rem] text-mist-500">{s.sublabel}</span>
              )}
            </span>
            <span className="text-[0.62rem] uppercase tracking-wider text-mist-600">
              {s.type}
            </span>
          </button>
        ),
      })
    );
  }

  return (
    <div ref={boxRef} className={cn("relative w-full", compact && "max-w-none")}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className={cn(
          "group relative flex items-center overflow-hidden rounded-full border border-white/10 bg-white/[0.04] transition-all duration-300",
          "focus-within:border-gold-500/60 focus-within:bg-white/[0.06] focus-within:shadow-[0_0_0_3px_rgba(212,175,55,0.12)]",
          open && "border-gold-500/50 bg-ink-850"
        )}
      >
        <Search size={16} className="ml-4 shrink-0 text-mist-400 transition group-focus-within:text-gold-400" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          autoFocus={autoFocus}
          placeholder="Search products, brands, categories…"
          aria-label="Search products"
          className="h-11 w-full bg-transparent px-3 text-sm text-mist-50 placeholder:text-mist-500 focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="px-2 text-mist-500 transition hover:text-mist-200"
          >
            <X size={15} />
          </button>
        )}
        <button
          type="submit"
          aria-label="Search"
          className="mr-1 flex h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-gold-500 to-gold-600 px-4 text-[0.78rem] font-semibold text-ink-950 transition hover:brightness-110"
        >
          Search
        </button>
      </form>

      <AnimatePresence>
        {open && (rows.length > 0 || loading) && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 max-h-[70vh] overflow-y-auto rounded-2xl border border-white/10 bg-ink-850/98 shadow-lift backdrop-blur-xl"
          >
            {loading && !rows.length && (
              <div className="space-y-2 p-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="skeleton h-9 rounded-lg" />
                ))}
              </div>
            )}
            {rows.map((r) => (
              <div key={r.key}>{r.node}</div>
            ))}
            {query.trim().length >= 2 && rows.length > 0 && (
              <button
                type="button"
                onClick={() => submit()}
                className="flex w-full items-center justify-center gap-2 border-t border-white/[0.06] px-4 py-3 text-xs font-medium text-gold-400 transition hover:bg-gold-500/10"
              >
                View all results for “{query.trim()}” <CornerDownLeft size={13} />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
