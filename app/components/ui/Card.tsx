"use client";

import { clsx } from "clsx";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  elevated?: boolean;
}

export function Card({ children, className, elevated }: CardProps) {
  return (
    <div
      className={clsx(
        "rounded-md p-4",
        elevated
          ? "bg-[var(--surface-container-high)]"
          : "bg-[var(--surface-container)]",
        className
      )}
    >
      {children}
    </div>
  );
}
