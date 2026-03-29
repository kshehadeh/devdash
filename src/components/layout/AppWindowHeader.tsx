"use client";

import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Search, Settings } from "lucide-react";
import { clsx } from "clsx";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { useCommandPaletteControls } from "@/context/CommandPaletteContext";

type DragStyle = CSSProperties & { WebkitAppRegion?: "drag" | "no-drag" };

const drag: DragStyle = { WebkitAppRegion: "drag" };
const noDrag: DragStyle = { WebkitAppRegion: "no-drag" };

export function AppWindowHeader({
  start,
  end,
  className,
}: {
  start: ReactNode;
  end?: ReactNode;
  className?: string;
}) {
  const { openCommandPalette } = useCommandPaletteControls();
  const isMac = typeof window !== "undefined" && window.electron.platform === "darwin";
  const shortcutTitle = isMac ? "⌘K" : "Ctrl+K";

  return (
    <header
      style={drag}
      className={clsx(
        "flex h-14 shrink-0 items-center gap-3 bg-[var(--surface-container-low)] px-6 relative z-20",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">{start}</div>

      <div style={noDrag} className="flex shrink-0 items-center gap-1">
        <NotificationCenter />
        <Link
          to="/settings"
          title="Settings"
          className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--on-surface-variant)] transition-colors hover:bg-[var(--surface-container-high)] hover:text-[var(--on-surface)]"
        >
          <Settings size={18} strokeWidth={2} aria-hidden />
        </Link>
        <button
          type="button"
          onClick={() => openCommandPalette()}
          title={`Search (${shortcutTitle})`}
          aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}
          className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--on-surface-variant)] transition-colors hover:bg-[var(--surface-container-high)] hover:text-[var(--on-surface)]"
        >
          <Search size={18} strokeWidth={2} aria-hidden />
        </button>
        {end}
      </div>
    </header>
  );
}

/** Use around header action groups so buttons stay clickable over the draggable title bar. */
export function AppWindowHeaderNoDrag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div style={noDrag} className={clsx("flex items-center gap-3", className)}>
      {children}
    </div>
  );
}
