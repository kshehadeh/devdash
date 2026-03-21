"use client";

import { useMemo } from "react";
import type { CommitDay } from "../../../lib/types";

interface CommitHeatmapProps {
  commits: CommitDay[];
  totalYTD: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["", "Mon", "", "Wed", "", "Fri", ""];

function getColor(count: number): string {
  if (count === 0) return "bg-[var(--surface-container-highest)]";
  if (count <= 2) return "bg-[var(--primary-container)] opacity-40";
  if (count <= 4) return "bg-[var(--primary-container)] opacity-60";
  if (count <= 6) return "bg-[var(--primary-container)] opacity-80";
  return "bg-[var(--primary)]";
}

export function CommitHeatmap({ commits, totalYTD }: CommitHeatmapProps) {
  const weeks = useMemo(() => {
    const result: CommitDay[][] = [];
    let week: CommitDay[] = [];

    if (commits.length === 0) return result;

    const firstDay = new Date(commits[0].date).getDay();
    for (let i = 0; i < firstDay; i++) {
      week.push({ date: "", count: -1 });
    }

    for (const day of commits) {
      week.push(day);
      if (week.length === 7) {
        result.push(week);
        week = [];
      }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push({ date: "", count: -1 });
      result.push(week);
    }
    return result;
  }, [commits]);

  const monthLabels = useMemo(() => {
    const labels: { label: string; col: number }[] = [];
    let lastMonth = -1;
    weeks.forEach((week, wi) => {
      for (const day of week) {
        if (!day.date) continue;
        const m = new Date(day.date).getMonth();
        if (m !== lastMonth) {
          labels.push({ label: MONTHS[m], col: wi });
          lastMonth = m;
        }
        break;
      }
    });
    return labels;
  }, [weeks]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider">
          Continuous integration activity over the last 12 months
        </span>
        <span className="text-sm font-bold text-[var(--on-surface)]">
          {totalYTD.toLocaleString()}
          <span className="text-xs font-normal text-[var(--on-surface-variant)] ml-1">
            Total Commits YTD
          </span>
        </span>
      </div>

      <div className="relative overflow-x-auto">
        <div className="flex gap-1 mb-1 pl-7">
          {monthLabels.map(({ label, col }) => (
            <div
              key={`${label}-${col}`}
              className="text-[10px] font-label text-[var(--on-surface-variant)] absolute"
              style={{ left: `${col * 12 + 28}px` }}
            >
              {label}
            </div>
          ))}
        </div>

        <div className="mt-4 flex gap-1">
          <div className="flex flex-col gap-1 mr-1">
            {DAYS.map((d, i) => (
              <div
                key={i}
                className="h-2.5 w-5 text-[9px] font-label text-[var(--on-surface-variant)] flex items-center justify-end"
              >
                {d}
              </div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              {week.map((day, di) => (
                <div
                  key={di}
                  title={day.date ? `${day.date}: ${day.count} commits` : ""}
                  className={`w-2.5 h-2.5 rounded-sm ${
                    day.count < 0
                      ? "opacity-0"
                      : getColor(day.count)
                  }`}
                />
              ))}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-1 mt-2 justify-end">
          <span className="text-[10px] font-label text-[var(--on-surface-variant)]">Less</span>
          {[0, 2, 4, 6, 8].map((c) => (
            <div key={c} className={`w-2.5 h-2.5 rounded-sm ${getColor(c)}`} />
          ))}
          <span className="text-[10px] font-label text-[var(--on-surface-variant)]">More</span>
        </div>
      </div>
    </div>
  );
}
