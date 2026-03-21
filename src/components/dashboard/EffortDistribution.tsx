"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { DeveloperStats } from "../../../lib/types";

interface EffortDistributionProps {
  distribution: DeveloperStats["effortDistribution"];
}

export function EffortDistribution({ distribution }: EffortDistributionProps) {
  const data = [
    { name: "Feature Work", value: distribution.feature, color: "#a7c8ff" },
    { name: "Bug Fixing", value: distribution.bugFix, color: "#ffb695" },
    { name: "Code Review", value: distribution.codeReview, color: "#b7c8e1" },
  ];

  return (
    <div>
      <div className="text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider mb-3">
        Effort Distribution
      </div>
      <div className="flex items-center gap-4">
        <div className="w-24 h-24 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={28}
                outerRadius={44}
                paddingAngle={2}
                dataKey="value"
                strokeWidth={0}
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--surface-container-highest)",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "11px",
                  color: "var(--on-surface)",
                }}
                formatter={(value) => [`${value}%`, ""]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-col gap-2">
          {data.map(({ name, value, color }) => (
            <div key={name} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: color }} />
              <span className="text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wide">
                {name}
              </span>
              <span className="text-xs font-medium text-[var(--on-surface)] ml-auto pl-2">
                {value}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
