"use client";

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { CommitDay } from "../../../lib/types";

interface CommitBarChartProps {
  commits: CommitDay[];
  lookbackDays: number;
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatLabel(dateStr: string, lookbackDays: number): string {
  const d = new Date(dateStr);
  if (lookbackDays <= 14) {
    return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`;
  }
  if (lookbackDays <= 30) {
    return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`;
  }
  return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`;
}

export function CommitBarChart({ commits, lookbackDays }: CommitBarChartProps) {
  const data = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - lookbackDays);
    return commits
      .filter((c) => c.date && new Date(c.date) >= cutoff)
      .map((c) => ({ date: c.date, count: c.count, label: formatLabel(c.date, lookbackDays) }));
  }, [commits, lookbackDays]);

  const totalCommits = useMemo(() => data.reduce((s, d) => s + d.count, 0), [data]);

  // Determine tick interval so we don't crowd the x-axis
  const tickInterval = useMemo(() => {
    if (data.length <= 14) return 0;
    if (data.length <= 30) return 3;
    if (data.length <= 60) return 6;
    return 9;
  }, [data.length]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider">
          Daily commit activity
        </span>
        <span className="text-sm font-bold text-[var(--on-surface)]">
          {totalCommits.toLocaleString()}
          <span className="text-xs font-normal text-[var(--on-surface-variant)] ml-1">
            commits
          </span>
        </span>
      </div>

      {data.length === 0 ? (
        <div className="flex items-center justify-center h-24 text-xs text-[var(--on-surface-variant)]">
          No commit data for this period
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data} barCategoryGap="20%">
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "var(--on-surface-variant)", fontFamily: "var(--font-label)" }}
              axisLine={false}
              tickLine={false}
              interval={tickInterval}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--on-surface-variant)", fontFamily: "var(--font-label)" }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              width={24}
            />
            <Tooltip
              cursor={{ fill: "var(--surface-container-highest)", radius: 4 }}
              contentStyle={{
                background: "var(--surface-container-highest)",
                border: "none",
                borderRadius: "6px",
                fontSize: "11px",
                color: "var(--on-surface)",
              }}
              labelStyle={{ color: "var(--on-surface)" }}
              itemStyle={{ color: "var(--on-surface-variant)" }}
              labelFormatter={(label) => label}
              formatter={(value) => [value, "commits"]}
            />
            <Bar dataKey="count" radius={[3, 3, 0, 0]}>
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.count === 0 ? "var(--surface-container-highest)" : "var(--primary-container)"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
