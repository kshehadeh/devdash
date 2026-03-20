"use client";

import { clsx } from "clsx";

type BadgeVariant = "primary" | "success" | "warning" | "error" | "neutral" | "tertiary";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  primary: "bg-[var(--primary-container)] text-[var(--on-primary)]",
  success: "bg-emerald-900/60 text-emerald-300",
  warning: "bg-amber-900/60 text-amber-300",
  error: "bg-[var(--error_container)] text-[var(--error)]",
  neutral: "bg-[var(--surface-container-highest)] text-[var(--on-surface-variant)]",
  tertiary: "bg-orange-900/50 text-[var(--tertiary)]",
};

export function Badge({ children, variant = "neutral", className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-label font-medium tracking-wide",
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
