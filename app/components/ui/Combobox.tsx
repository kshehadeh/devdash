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
  onSearch?: (query: string) => void;
  placeholder?: string;
  loading?: boolean;
  searchLoading?: boolean;
  disabled?: boolean;
  label?: string;
  searchPlaceholder?: string;
  minSearchLength?: number;
}

export function Combobox({
  options,
  value,
  onChange,
  onSearch,
  placeholder = "Select...",
  loading = false,
  searchLoading = false,
  disabled = false,
  label,
  searchPlaceholder = "Search...",
  minSearchLength = 0,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const selected = options.find((o) => o.value === value);

  // Client-side filtering (only when no onSearch callback)
  const filtered = onSearch
    ? options
    : query
      ? options.filter(
          (o) =>
            o.label.toLowerCase().includes(query.toLowerCase()) ||
            o.value.toLowerCase().includes(query.toLowerCase()) ||
            o.description?.toLowerCase().includes(query.toLowerCase()),
        )
      : options;

  const handleQueryChange = useCallback(
    (q: string) => {
      setQuery(q);
      if (onSearch) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          if (q.length >= minSearchLength) {
            onSearch(q);
          }
        }, 300);
      }
    },
    [onSearch, minSearchLength],
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
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const showHint = onSearch && query.length < minSearchLength && query.length > 0;
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
        onClick={() => { setOpen(!open); setQuery(""); }}
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
            {showHint ? (
              <div className="px-3 py-4 text-xs text-[var(--on-surface-variant)] text-center">
                Type at least {minSearchLength} character{minSearchLength !== 1 ? "s" : ""} to search
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-4 text-xs text-[var(--on-surface-variant)] text-center">
                {isSearching ? "Searching..." : query ? "No results found" : "Start typing to search"}
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
