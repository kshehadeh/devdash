"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { clsx } from "clsx";
import { invoke } from "@/lib/api";
import type { GlobalSearchResult } from "@/lib/types";

type PaletteRow =
  | { type: "action"; id: "create-reminder"; title: string; subtitle: string }
  | { type: "result"; result: GlobalSearchResult };

const CREATE_REMINDER_TITLE = "Create reminder";
const CREATE_REMINDER_SUBTITLE = "Open Reminders and start a new timed reminder";

/** True when the query should surface the Create reminder action (hidden when empty). */
function createReminderActionMatchesQuery(raw: string): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return false;

  const haystack = `${CREATE_REMINDER_TITLE} ${CREATE_REMINDER_SUBTITLE}`.toLowerCase();
  if (haystack.includes(q)) return true;

  const tokens = [
    "create",
    "reminder",
    "reminders",
    "new",
    "add",
    "open",
    "start",
    "timed",
    "alarm",
    "snooze",
    "due",
    "later",
    "notify",
  ];
  if (tokens.some((t) => t.startsWith(q) || q.startsWith(t))) return true;
  if (q.length >= 2 && tokens.some((t) => t.includes(q))) return true;

  return false;
}

export function CommandPalette({
  developerId,
  open,
  onOpenChange,
}: {
  developerId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const canSearch = Boolean(developerId && query.trim().length >= 2);

  const rows = useMemo((): PaletteRow[] => {
    const list: PaletteRow[] = [];
    if (createReminderActionMatchesQuery(query)) {
      list.push({
        type: "action",
        id: "create-reminder",
        title: CREATE_REMINDER_TITLE,
        subtitle: CREATE_REMINDER_SUBTITLE,
      });
    }
    if (canSearch) {
      for (const r of results) {
        list.push({ type: "result", result: r });
      }
    }
    return list;
  }, [query, canSearch, results]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

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
  }, [query, results, open]);

  const runCreateReminder = useCallback(() => {
    if (location.pathname === "/reminders") {
      const p = new URLSearchParams(location.search);
      p.set("new", "1");
      navigate(`/reminders?${p.toString()}`);
    } else {
      navigate("/reminders?new=1");
    }
    onOpenChange(false);
  }, [location.pathname, location.search, navigate, onOpenChange]);

  const selectRow = useCallback(
    (row: PaletteRow) => {
      if (row.type === "action" && row.id === "create-reminder") {
        runCreateReminder();
        return;
      }
      if (row.type === "result") {
        const r = row.result;
        if (r.navigatePath) navigate(r.navigatePath);
        if (r.openUrl) window.open(r.openUrl, "_blank", "noopener,noreferrer");
        onOpenChange(false);
      }
    },
    [navigate, onOpenChange, runCreateReminder],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(rows.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && rows[highlight]) {
      e.preventDefault();
      selectRow(rows[highlight]);
    }
  };

  const hint = useMemo(() => {
    if (!developerId) {
      return "Type to find actions (e.g. create reminder) · Select a developer on the dashboard to search";
    }
    return "↑↓ · Enter · Type to match actions or 2+ characters to search";
  }, [developerId]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[250] flex items-start justify-center pt-[15vh] px-4 bg-black/40"
      role="dialog"
      aria-modal
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
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
          {!loading && rows.length === 0 && query.trim().length > 0 && (
            <p className="px-3 py-4 text-xs text-[var(--on-surface-variant)]">No matching actions or results</p>
          )}
          {!loading && rows.length === 0 && query.trim().length === 0 && (
            <p className="px-3 py-4 text-xs text-[var(--on-surface-variant)]">Start typing to search or run an action</p>
          )}
          {rows.map((row, i) => {
            if (row.type === "action") {
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => selectRow(row)}
                  className={clsx(
                    "w-full text-left px-3 py-2 border-b border-[var(--outline-variant)]/10 flex flex-col gap-0.5",
                    i === highlight ? "bg-[var(--primary)]/15" : "hover:bg-[var(--surface-container)]",
                  )}
                >
                  <span className="text-xs font-medium text-[var(--on-surface)]">{row.title}</span>
                  <span className="text-[10px] text-[var(--on-surface-variant)]">{row.subtitle}</span>
                </button>
              );
            }
            const r = row.result;
            return (
              <button
                key={`${r.kind}-${r.id}`}
                type="button"
                onClick={() => selectRow(row)}
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
            );
          })}
          {loading && <p className="px-3 py-4 text-xs text-[var(--on-surface-variant)]">Searching…</p>}
        </div>
      </div>
    </div>
  );
}
