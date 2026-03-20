"use client";

import { clsx } from "clsx";

type Status = "on_track" | "at_risk" | "blocked" | "active" | "inactive";

const statusConfig: Record<Status, { dot: string; label: string }> = {
  on_track: { dot: "bg-emerald-400", label: "On Track" },
  at_risk: { dot: "bg-amber-400", label: "At Risk" },
  blocked: { dot: "bg-[var(--error)]", label: "Blocked" },
  active: { dot: "bg-emerald-400", label: "Active" },
  inactive: { dot: "bg-[var(--outline)]", label: "Inactive" },
};

interface StatusIndicatorProps {
  status: Status;
  showLabel?: boolean;
  className?: string;
}

export function StatusIndicator({ status, showLabel = true, className }: StatusIndicatorProps) {
  const config = statusConfig[status];
  return (
    <span className={clsx("inline-flex items-center gap-1.5", className)}>
      <span className={clsx("w-1.5 h-1.5 rounded-full", config.dot)} />
      {showLabel && (
        <span className="text-xs font-label text-[var(--on-surface-variant)]">{config.label}</span>
      )}
    </span>
  );
}
