"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CategoryOption } from "./ProductForm";

type Choice = CategoryOption & { label: string };

/**
 * Searchable category combobox.
 *
 * The product form used a plain `<select>`, which gets unusable once the
 * catalog has a few dozen nested categories — no search, and sub-categories
 * were only told apart by leading dashes. This filters while you type and
 * matches the whole "Parent › Child" path, so typing "kurti" finds it
 * wherever it sits in the tree.
 */
export function CategoryPicker({
  options,
  value,
  onChange,
  invalid,
  placeholder = "Search category…",
}: {
  options: CategoryOption[];
  value: string;
  onChange: (id: string) => void;
  invalid?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  /**
   * Rebuild "Parent › Child" labels. The page hands us a depth-first flat
   * list (depth = nesting level), so a stack of the ancestors seen so far is
   * enough — no second lookup round-trip.
   */
  const choices = useMemo<Choice[]>(() => {
    const stack: string[] = [];
    return options.map((o) => {
      stack.length = o.depth;
      const path = [...stack, o.name];
      stack.push(o.name);
      return { ...o, label: path.join(" › ") };
    });
  }, [options]);

  const selected = choices.find((c) => c.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return choices;
    return choices.filter((c) => c.label.toLowerCase().includes(q));
  }, [choices, query]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const openList = () => {
    const idx = choices.findIndex((c) => c.id === value);
    setActive(idx >= 0 ? idx : 0);
    setQuery("");
    setOpen(true);
  };

  const pick = (id: string) => {
    onChange(id);
    close();
    inputRef.current?.focus();
  };

  const clearValue = () => {
    onChange("");
    inputRef.current?.focus();
  };

  // Outside click closes; the selection stays as-is.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep the highlighted row visible while arrowing through the list.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        openList();
        return;
      }
      if (!filtered.length) return;
      setActive((a) =>
        e.key === "ArrowDown"
          ? (a + 1) % filtered.length
          : (a - 1 + filtered.length) % filtered.length
      );
    } else if (e.key === "Enter") {
      if (!open) return;
      e.preventDefault();
      const c = filtered[active];
      if (c) pick(c.id);
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        close();
      }
    } else if (e.key === "Tab") {
      close();
    }
  };

  const onQuery = (v: string) => {
    if (!open) setOpen(true);
    setQuery(v);
    setActive(0);
  };

  const showClear = open ? query.length > 0 : Boolean(selected);

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mist-600" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="category-picker-list"
          aria-autocomplete="list"
          aria-activedescendant={open && filtered.length ? `category-opt-${active}` : undefined}
          aria-invalid={invalid || undefined}
          autoComplete="off"
          spellCheck={false}
          value={open ? query : (selected?.label ?? "")}
          onChange={(e) => onQuery(e.target.value)}
          onFocus={() => {
            if (!open) openList();
          }}
          onClick={() => {
            // focus can survive an Escape / outside click that closed the
            // list, so a plain click has to re-open it too
            if (!open) openList();
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className={cn(
            "input-premium pl-9",
            // the clear button sits at right-8 (32px) and is ~22px wide
            showClear ? "pr-[3.75rem]" : "pr-8",
            invalid && "border-danger/60"
          )}
        />

        {showClear && (
          <button
            type="button"
            aria-label={open ? "Clear search" : "Clear category"}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (open) onQuery("");
              else clearValue();
            }}
            className="absolute right-8 top-1/2 -translate-y-1/2 rounded-md p-1 text-mist-500 transition hover:text-mist-200"
          >
            <X size={14} />
          </button>
        )}

        <button
          type="button"
          aria-label={open ? "Close category list" : "Open category list"}
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (open) {
              close();
            } else {
              inputRef.current?.focus();
              openList();
            }
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-mist-500 transition hover:text-gold-300"
        >
          <ChevronDown size={16} className={cn("transition", open && "rotate-180")} />
        </button>
      </div>

      {open && (
        <ul
          ref={listRef}
          id="category-picker-list"
          role="listbox"
          className="absolute z-40 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-white/10 bg-ink-900 p-1 shadow-lift"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-3 text-[0.82rem] text-mist-500">
              No category matches “{query.trim()}”.
            </li>
          ) : (
            filtered.map((c, i) => (
              <li
                key={c.id}
                id={`category-opt-${i}`}
                data-i={i}
                role="option"
                aria-selected={c.id === value}
                onMouseEnter={() => setActive(i)}
                // mousedown (not click) so the input never blurs first
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(c.id);
                }}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-[0.85rem] leading-snug transition",
                  i === active ? "bg-gold-500/10 text-gold-200" : "text-mist-300"
                )}
              >
                <span
                  className="truncate"
                  style={query.trim() ? undefined : { paddingLeft: c.depth * 12 }}
                >
                  {query.trim() ? c.label : c.name}
                </span>
                {c.id === value && <Check size={14} className="shrink-0 text-gold-400" />}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
