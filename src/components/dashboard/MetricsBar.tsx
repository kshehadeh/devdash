"use client";

import { TrendingUp, GitMerge, Activity, Ticket, BookOpen, Info, type LucideIcon } from "lucide-react";
import { MetricSkeleton } from "../ui/CardSkeleton";
import type { VelocityStatsResponse, TicketsStatsResponse, ConfluenceStatsResponse } from "../../../lib/types";

interface MetricsBarProps {
  lookbackDays: number;
  velocity: VelocityStatsResponse | null;
  tickets: TicketsStatsResponse | null;
  confluence: ConfluenceStatsResponse | null;
  velocityLoading: boolean;
  ticketsLoading: boolean;
  confluenceLoading: boolean;
}

interface MetricDef {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  subColor: string;
  period?: string;
  description?: string;
}

function MetricCard({ icon: Icon, label, value, sub, subColor, period, description }: MetricDef) {
  const hasCorner = Boolean(period || description);
  return (
    <div className="bg-[var(--surface-container)] rounded-md p-4 flex gap-3 items-start relative min-w-0">
      <div className="w-8 h-8 rounded-md bg-[var(--surface-container-highest)] flex items-center justify-center shrink-0">
        <Icon size={16} className="text-[var(--primary)]" />
      </div>
      <div className={`min-w-0 flex-1 ${hasCorner ? "pr-10" : ""}`}>
        <div className="flex items-center mb-1 min-w-0 overflow-hidden">
          <span className="text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider truncate">
            {label}
          </span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
          <span className="text-2xl font-bold text-[var(--on-surface)] leading-none shrink-0">{value}</span>
          <span className={`text-xs font-label font-semibold min-w-0 break-words ${subColor}`}>{sub}</span>
        </div>
      </div>
      <div className="absolute bottom-2 right-2 flex items-center gap-1">
        {period && (
          <span className="text-[9px] font-label text-[var(--on-surface-variant)]/60 uppercase tracking-wider whitespace-nowrap">
            {period}
          </span>
        )}
        {description && (
          <div className="relative group">
            <Info size={11} className="text-[var(--on-surface-variant)]/50 hover:text-[var(--on-surface-variant)] cursor-default transition-colors" />
            <div className="absolute bottom-full right-0 mb-2 w-52 p-2 rounded-md bg-[var(--surface-container-highest)] border border-[var(--outline-variant)]/30 shadow-lg text-[10px] text-[var(--on-surface-variant)] leading-relaxed opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
              {description}
              <div className="absolute top-full right-2 border-4 border-transparent border-t-[var(--surface-container-highest)]" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function MetricsBar({
  lookbackDays,
  velocity,
  tickets,
  confluence,
  velocityLoading,
  ticketsLoading,
  confluenceLoading,
}: MetricsBarProps) {
  const periodLabel = `Last ${lookbackDays}d`;

  return (
    <div className="grid grid-cols-5 gap-3">
      {velocityLoading || !velocity ? (
        <>
          <MetricSkeleton />
          <MetricSkeleton />
        </>
      ) : (
        <>
          <MetricCard
            icon={TrendingUp}
            label="Velocity"
            value={velocity.velocity.toString()}
            sub={velocity.velocityChange >= 0 ? `↑ ${velocity.velocityChange}%` : `↓ ${Math.abs(velocity.velocityChange)}%`}
            subColor={velocity.velocityChange >= 0 ? "text-emerald-400" : "text-[var(--error)]"}
            period={periodLabel}
            description="Number of pull requests merged in the selected period. The percentage shows change vs. the prior period of equal length."
          />
          <MetricCard
            icon={GitMerge}
            label="Merge Ratio"
            value={`${velocity.mergeRatio}%`}
            sub={velocity.mergeRatio >= 90 ? "OPTIMAL" : velocity.mergeRatio >= 70 ? "GOOD" : velocity.mergeRatio >= 50 ? "FAIR" : "LOW"}
            subColor={velocity.mergeRatio >= 90 ? "text-emerald-400" : velocity.mergeRatio >= 70 ? "text-[var(--primary)]" : "text-[var(--error)]"}
            period={periodLabel}
            description="Percentage of opened pull requests that were successfully merged. A higher ratio indicates fewer abandoned or rejected PRs."
          />
        </>
      )}

      {ticketsLoading || !tickets ? (
        <>
          <MetricSkeleton />
          <MetricSkeleton />
        </>
      ) : (
        <>
          <MetricCard
            icon={Activity}
            label="Workload Health"
            value={`${tickets.workloadHealth}/10`}
            sub={tickets.workloadHealth >= 8 ? "HEALTHY" : tickets.workloadHealth >= 5 ? "MODERATE" : tickets.workloadHealth > 0 ? "OVERLOADED" : "NO DATA"}
            subColor={tickets.workloadHealth >= 8 ? "text-emerald-400" : tickets.workloadHealth >= 5 ? "text-amber-400" : tickets.workloadHealth > 0 ? "text-[var(--error)]" : "text-[var(--on-surface-variant)]"}
            description={
              tickets.providerId === "linear"
                ? "A score from 1–10 reflecting open Linear issue load (WIP and volume). Lower scores suggest overload."
                : "A score from 1–10 reflecting ticket load balance. It factors in the number of open tickets, blockers, and how evenly work is distributed. Lower scores indicate overload."
            }
          />
          <MetricCard
            icon={Ticket}
            label="Ticket Velocity"
            value={`${tickets.ticketVelocity}`}
            sub="completed"
            subColor={tickets.ticketVelocity >= 10 ? "text-emerald-400" : tickets.ticketVelocity >= 5 ? "text-[var(--primary)]" : "text-[var(--on-surface-variant)]"}
            period={periodLabel}
            description={
              tickets.providerId === "linear"
                ? "Linear issues completed or canceled in the selected period."
                : "Total number of tickets moved to a completed or done state within the selected period."
            }
          />
        </>
      )}

      {confluenceLoading || !confluence ? (
        <MetricSkeleton />
      ) : (
        <MetricCard
          icon={BookOpen}
          label="Doc Authority"
          value={`Lvl ${confluence.docAuthorityLevel}`}
          sub={confluence.docAuthorityLevel >= 4 ? "EXPERT" : confluence.docAuthorityLevel >= 2 ? "ACTIVE" : "CONTRIBUTOR"}
          subColor={confluence.docAuthorityLevel >= 4 ? "text-emerald-400" : "text-[var(--primary)]"}
          description="Measures documentation contribution level based on pages created, updated, and commented on in Confluence. Level 1 = Contributor, Level 3 = Active, Level 5 = Expert."
        />
      )}
    </div>
  );
}
