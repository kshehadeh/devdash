"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Search, Loader2 } from "lucide-react";
import { clsx } from "clsx";

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  /** Debounced server search; local filtering still applies to `options` on every keystroke. */
  onSearch?: (query: string) => void;
  /** Called on every input change (before debounce). Use to clear stale server-hit keys. */
  onSearchInput?: (query: string) => void;
  /**
   * Option values from the latest server search that should stay visible while typing even when
   * they do not match the local substring filter (e.g. CQL matches name differently).
   */
  searchMatchKeys?: ReadonlySet<string>;
  placeholder?: string;
  loading?: boolean;
  searchLoading?: boolean;
  disabled?: boolean;
  label?: string;
  searchPlaceholder?: string;
  /** Minimum trimmed length before `onSearch` runs (local filter ignores this). */
  minSearchLength?: number;
  /** Delay before calling `onSearch` after typing stops (default 350ms). */
  searchDebounceMs?: number;
  /** Shown when there are no options, the search box is empty, and not loading (e.g. “Type to search…”). */
  emptyBrowseHint?: string;
}

export function Combobox({
  options,
  value,
  onChange,
  onSearch,
  onSearchInput,
  searchMatchKeys,
  placeholder = "Select...",
  loading = false,
  searchLoading = false,
  disabled = false,
  label,
  searchPlaceholder = "Search...",
  minSearchLength = 0,
  searchDebounceMs = 350,
  emptyBrowseHint,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const selected = options.find((o) => o.value === value);

  function optionMatchesFilter(o: ComboboxOption, q: string): boolean {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return (
      o.label.toLowerCase().includes(t) ||
      o.value.toLowerCase().includes(t) ||
      !!o.description?.toLowerCase().includes(t)
    );
  }

  const trimmedQuery = query.trim();
  const filtered =
    !trimmedQuery
      ? options
      : options.filter(
          (o) =>
            optionMatchesFilter(o, query) ||
            !!(searchMatchKeys?.size && searchMatchKeys.has(o.value)),
        );

  const handleQueryChange = useCallback(
    (q: string) => {
      setQuery(q);
      onSearchInput?.(q);
      if (!onSearch) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const trimmed = q.trim();
        if (!trimmed) {
          onSearch("");
        } else if (trimmed.length >= minSearchLength) {
          onSearch(trimmed);
        }
      }, searchDebounceMs);
    },
    [onSearch, onSearchInput, minSearchLength, searchDebounceMs],
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const isSearching = searchLoading;

  return (
    <div ref={ref} className="relative">
      {label && (
        <label className="block text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
          {label}
        </label>
      )}
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => {
          setOpen(!open);
          setQuery("");
          onSearchInput?.("");
        }}
        className={clsx(
          "w-full flex items-center gap-2 bg-[var(--surface-container-lowest)] text-sm rounded-md px-3 py-2.5 outline-none focus:ring-1 focus:ring-[var(--primary)] transition-colors text-left",
          disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-[var(--surface-container-low)]",
        )}
      >
        {loading ? (
          <Loader2 size={14} className="text-[var(--on-surface-variant)] animate-spin shrink-0" />
        ) : null}
        <span className={clsx("flex-1 truncate", !selected && "text-[var(--outline)]")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={14}
          className={clsx(
            "text-[var(--on-surface-variant)] transition-transform shrink-0",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-[var(--surface-container-highest)] rounded-md shadow-lg overflow-hidden max-h-64 flex flex-col">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--outline-variant)]/20 shrink-0">
            {isSearching ? (
              <Loader2 size={13} className="text-[var(--on-surface-variant)] animate-spin shrink-0" />
            ) : (
              <Search size={13} className="text-[var(--on-surface-variant)] shrink-0" />
            )}
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="flex-1 bg-transparent text-sm text-[var(--on-surface)] outline-none placeholder:text-[var(--outline)]"
            />
          </div>
          <div className="overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-xs text-[var(--on-surface-variant)] text-center">
                {isSearching
                  ? "Searching..."
                  : query.trim()
                    ? "No results found"
                    : options.length === 0 && emptyBrowseHint
                      ? emptyBrowseHint
                      : "No options"}
              </div>
            ) : (
              filtered.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                    setQuery("");
                    onSearchInput?.("");
                  }}
                  className={clsx(
                    "w-full text-left px-3 py-2.5 hover:bg-[var(--surface-bright)] transition-colors",
                    option.value === value && "bg-[var(--surface-bright)]",
                  )}
                >
                  <div className="text-sm text-[var(--on-surface)] truncate">{option.label}</div>
                  {option.description && (
                    <div className="text-xs text-[var(--on-surface-variant)] truncate">{option.description}</div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
