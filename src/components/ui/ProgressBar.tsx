"use client";

import { clsx } from "clsx";

interface ProgressBarProps {
  value: number;
  max?: number;
  className?: string;
  showLabel?: boolean;
  color?: "primary" | "tertiary" | "success";
}

const colorStyles = {
  primary: "bg-gradient-to-r from-[var(--primary)] to-[var(--primary-container)]",
  tertiary: "bg-[var(--tertiary)]",
  success: "bg-emerald-400",
};

export function ProgressBar({
  value,
  max = 100,
  className,
  showLabel = false,
  color = "primary",
}: ProgressBarProps) {
  const pct = Math.min(100, Math.round((value / max) * 100));

  return (
    <div className={clsx("flex items-center gap-3", className)}>
      <div className="flex-1 h-1.5 bg-[var(--surface-container-highest)] rounded-full overflow-hidden">
        <div
          className={clsx("h-full rounded-full transition-all duration-500", colorStyles[color])}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-label text-[var(--on-surface-variant)] w-8 text-right">
          {pct}%
        </span>
      )}
    </div>
  );
}
