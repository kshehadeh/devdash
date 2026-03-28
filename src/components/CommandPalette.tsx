"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { clsx } from "clsx";
import { invoke } from "@/lib/api";
import type { GlobalSearchResult } from "@/lib/types";

export function CommandPalette({ developerId }: { developerId: string | null }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const canSearch = Boolean(developerId && query.trim().length >= 2);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open || !developerId) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const id = window.setTimeout(() => {
      invoke<GlobalSearchResult[]>("search:global", { developerId, query: q, limit: 25 })
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => window.clearTimeout(id);
  }, [open, developerId, query]);

  useEffect(() => {
    setHighlight(0);
  }, [results]);

  const select = useCallback(
    (r: GlobalSearchResult) => {
      if (r.navigatePath) navigate(r.navigatePath);
      if (r.openUrl) window.open(r.openUrl, "_blank", "noopener,noreferrer");
      setOpen(false);
    },
    [navigate],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && results[highlight]) {
      e.preventDefault();
      select(results[highlight]);
    }
  };

  const hint = useMemo(
    () => (developerId ? "Type 2+ characters · ↑↓ · Enter" : "Select a developer on the dashboard first"),
    [developerId],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[250] flex items-start justify-center pt-[15vh] px-4 bg-black/40"
      role="dialog"
      aria-modal
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-[var(--outline-variant)]/30 bg-[var(--surface-container-highest)] shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--outline-variant)]/20">
          <Search size={16} className="text-[var(--on-surface-variant)] shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search PRs, tickets, reminders, pages…"
            className="flex-1 min-w-0 bg-transparent text-sm text-[var(--on-surface)] outline-none placeholder:text-[var(--on-surface-variant)]/50"
          />
        </div>
        <p className="px-3 py-1 text-[10px] font-label text-[var(--on-surface-variant)]">{hint}</p>
        <div className="max-h-72 overflow-y-auto">
          {loading && <p className="px-3 py-4 text-xs text-[var(--on-surface-variant)]">Searching…</p>}
          {!loading && canSearch && results.length === 0 && query.trim().length >= 2 && (
            <p className="px-3 py-4 text-xs text-[var(--on-surface-variant)]">No results</p>
          )}
          {results.map((r, i) => (
            <button
              key={`${r.kind}-${r.id}`}
              type="button"
              onClick={() => select(r)}
              className={clsx(
                "w-full text-left px-3 py-2 border-b border-[var(--outline-variant)]/10 flex flex-col gap-0.5",
                i === highlight ? "bg-[var(--primary)]/15" : "hover:bg-[var(--surface-container)]",
              )}
            >
              <span className="text-xs font-medium text-[var(--on-surface)] truncate">{r.title}</span>
              <span className="text-[10px] text-[var(--on-surface-variant)]">
                {r.kind} · {r.subtitle}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
