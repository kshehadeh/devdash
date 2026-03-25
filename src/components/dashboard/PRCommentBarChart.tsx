"use client";

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { CommitDay } from "../../../lib/types";

interface PRCommentBarChartProps {
  commentDays: CommitDay[];
  totalComments: number;
  lookbackDays: number;
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatLabel(dateStr: string): string {
  const d = new Date(dateStr);
  return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`;
}

export function PRCommentBarChart({ commentDays, totalComments, lookbackDays }: PRCommentBarChartProps) {
  const data = useMemo(
    () => commentDays.map((c) => ({ ...c, label: formatLabel(c.date) })),
    [commentDays],
  );

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
          PR review comments
        </span>
        <span className="text-sm font-bold text-[var(--on-surface)]">
          {totalComments.toLocaleString()}
          <span className="text-xs font-normal text-[var(--on-surface-variant)] ml-1">
            comments · last {lookbackDays}d
          </span>
        </span>
      </div>

      {data.length === 0 ? (
        <div className="flex items-center justify-center h-24 text-xs text-[var(--on-surface-variant)]">
          No comment data for this period
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={140}>
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
              formatter={(value) => [value, "comments"]}
            />
            <Bar dataKey="count" radius={[3, 3, 0, 0]}>
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.count === 0 ? "var(--surface-container-highest)" : "var(--secondary-container)"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
