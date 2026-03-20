"use client";

import { clsx } from "clsx";

interface CardSkeletonProps {
  className?: string;
  lines?: number;
}

function ShimmerBar({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        "rounded bg-[var(--surface-container-highest)] animate-pulse",
        className,
      )}
    />
  );
}

export function CardSkeleton({ className, lines = 4 }: CardSkeletonProps) {
  return (
    <div className={clsx("bg-[var(--surface-container)] rounded-md p-4", className)}>
      <ShimmerBar className="h-4 w-1/3 mb-4" />
      <div className="space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <ShimmerBar key={i} className={`h-3 ${i % 2 === 0 ? "w-full" : "w-2/3"}`} />
        ))}
      </div>
    </div>
  );
}

export function MetricSkeleton() {
  return (
    <div className="bg-[var(--surface-container)] rounded-md p-4 flex gap-3 items-start">
      <div className="w-8 h-8 rounded-md bg-[var(--surface-container-highest)] animate-pulse shrink-0" />
      <div className="flex-1 space-y-2">
        <ShimmerBar className="h-3 w-2/3" />
        <ShimmerBar className="h-6 w-1/2" />
      </div>
    </div>
  );
}
