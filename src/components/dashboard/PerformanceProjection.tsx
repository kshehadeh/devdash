"use client";

import { TrendingUp } from "lucide-react";
import type { DeveloperStats } from "../../../lib/types";

const trajectoryMessages: Record<DeveloperStats["performanceTrajectory"], string> = {
  exceptional:
    'Based on current velocity and documentation impact, on track for "Exceptional" status this quarter.',
  strong: "Strong performance this quarter. Maintaining above-average velocity and code quality.",
  on_track: "On track to meet quarterly targets. Steady progress across all metrics.",
  needs_improvement:
    "Some areas need attention. Consider reviewing sprint efficiency and PR cycle times.",
};

interface PerformanceProjectionProps {
  trajectory: DeveloperStats["performanceTrajectory"];
}

export function PerformanceProjection({ trajectory }: PerformanceProjectionProps) {
  return (
    <div>
      <div className="text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider mb-3">
        Next Performance Review
      </div>
      <p className="text-sm text-[var(--on-surface)] leading-relaxed mb-4">
        {trajectoryMessages[trajectory]}
      </p>
      <button className="flex items-center gap-2 text-xs font-label font-semibold text-[var(--primary)] uppercase tracking-wider hover:opacity-80 transition-opacity">
        <TrendingUp size={14} />
        View Projections
      </button>
    </div>
  );
}
