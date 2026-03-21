"use client";

import { ProgressBar } from "../ui/ProgressBar";
import { Badge } from "../ui/Badge";
import { StatusIndicator } from "../ui/StatusIndicator";
import type { Sprint, SprintIssue } from "../../../lib/types";

interface SprintTrackerProps {
  sprint: Sprint;
}

const statusBadge = {
  todo: <Badge variant="neutral">TODO</Badge>,
  in_progress: <Badge variant="tertiary">IN PROGRESS</Badge>,
  done: <Badge variant="success">DONE</Badge>,
};

const priorityDot: Record<SprintIssue["priority"], string> = {
  critical: "bg-[var(--error)]",
  high: "bg-amber-400",
  medium: "bg-[var(--primary)]",
  low: "bg-[var(--outline)]",
};

export function SprintTracker({ sprint }: SprintTrackerProps) {
  if (sprint.totalDays === 0) {
    return (
      <div className="py-6 text-center">
        <p className="text-sm text-[var(--on-surface-variant)]">No active sprint found.</p>
        <p className="text-xs text-[var(--on-surface-variant)] mt-1">
          Assign Jira projects with active sprints in Data Sources.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider">
            Day {sprint.currentDay} of {sprint.totalDays}
          </span>
          <StatusIndicator status={sprint.status} />
        </div>
      </div>

      <ProgressBar value={sprint.currentDay} max={sprint.totalDays} className="mb-4" />

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-[var(--surface-container-high)] rounded-md p-3">
          <div className="text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider mb-1">
            Cycle Time
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-[var(--on-surface)]">{sprint.cycleTime}d</span>
            <span className={`text-xs font-label ${sprint.cycleTime <= 3 ? "text-emerald-400" : sprint.cycleTime <= 7 ? "text-[var(--on-surface-variant)]" : "text-amber-400"}`}>
              {sprint.cycleTime <= 3 ? "FAST" : sprint.cycleTime <= 7 ? "AVG" : "SLOW"}
            </span>
          </div>
        </div>
        <div className="bg-[var(--surface-container-high)] rounded-md p-3">
          <div className="text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider mb-1">
            Throughput
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-[var(--on-surface)]">{sprint.throughput}</span>
            <span className="text-xs font-label text-[var(--on-surface-variant)]">completed</span>
          </div>
        </div>
        <div className="bg-[var(--surface-container-high)] rounded-md p-3">
          <div className="text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider mb-1">
            Risk Level
          </div>
          <div className="flex items-baseline gap-1">
            <span className={`text-xl font-bold ${sprint.overdueCount > 0 ? "text-amber-400" : "text-emerald-400"}`}>
              {sprint.overdueCount > 0 ? "Medium" : "Low"}
            </span>
          </div>
          <div className="text-xs font-label text-[var(--on-surface-variant)] mt-0.5">
            {sprint.overdueCount === 0
              ? "0 overdue tickets"
              : `${sprint.overdueCount} overdue`}
          </div>
        </div>
      </div>

      <table className="w-full">
        <thead>
          <tr>
            <th className="text-left text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider pb-2 w-6" />
            <th className="text-left text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider pb-2">
              Issue
            </th>
            <th className="text-left text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider pb-2 w-28">
              Status
            </th>
            <th className="text-right text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider pb-2 w-16">
              Points
            </th>
          </tr>
        </thead>
        <tbody>
          {sprint.issues.map((issue) => (
            <tr
              key={issue.id}
              className="hover:bg-[var(--surface-container-high)] transition-colors rounded-md"
            >
              <td className="py-2 pr-2">
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${priorityDot[issue.priority]}`} />
              </td>
              <td className="py-2 pr-3">
                <div className="text-xs font-label text-[var(--on-surface-variant)] mb-0.5">
                  {issue.key}
                </div>
                <div className="text-sm text-[var(--on-surface)] leading-snug">{issue.title}</div>
              </td>
              <td className="py-2 pr-3">{statusBadge[issue.status]}</td>
              <td className="py-2 text-right text-sm font-medium text-[var(--on-surface)]">
                {issue.points}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
