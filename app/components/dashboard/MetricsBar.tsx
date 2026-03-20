"use client";

import { TrendingUp, GitMerge, Activity, Ticket, BookOpen, type LucideIcon } from "lucide-react";
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
}

function MetricCard({ icon: Icon, label, value, sub, subColor, period }: MetricDef) {
  return (
    <div className="bg-[var(--surface-container)] rounded-md p-4 flex gap-3 items-start">
      <div className="w-8 h-8 rounded-md bg-[var(--surface-container-highest)] flex items-center justify-center shrink-0">
        <Icon size={16} className="text-[var(--primary)]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider">
            {label}
          </span>
          {period && (
            <span className="text-[9px] font-label text-[var(--on-surface-variant)]/60 uppercase tracking-wider">
              {period}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-[var(--on-surface)] leading-none">{value}</span>
          <span className={`text-xs font-label font-semibold ${subColor}`}>{sub}</span>
        </div>
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
          />
          <MetricCard
            icon={GitMerge}
            label="Merge Ratio"
            value={`${velocity.mergeRatio}%`}
            sub={velocity.mergeRatio >= 90 ? "OPTIMAL" : velocity.mergeRatio >= 70 ? "GOOD" : velocity.mergeRatio >= 50 ? "FAIR" : "LOW"}
            subColor={velocity.mergeRatio >= 90 ? "text-emerald-400" : velocity.mergeRatio >= 70 ? "text-[var(--primary)]" : "text-[var(--error)]"}
            period={periodLabel}
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
          />
          <MetricCard
            icon={Ticket}
            label="Ticket Velocity"
            value={`${tickets.ticketVelocity}`}
            sub="completed"
            subColor={tickets.ticketVelocity >= 10 ? "text-emerald-400" : tickets.ticketVelocity >= 5 ? "text-[var(--primary)]" : "text-[var(--on-surface-variant)]"}
            period={periodLabel}
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
        />
      )}
    </div>
  );
}
