"use client";

import { GitMerge, MessageCircle, Ban, ChevronRight } from "lucide-react";
import { Badge } from "../ui/Badge";
import type { PullRequest } from "../../../lib/types";

interface PullRequestListProps {
  prs: PullRequest[];
}

const statusConfig = {
  merged: {
    icon: GitMerge,
    badge: <Badge variant="primary">MERGED</Badge>,
    iconColor: "text-[var(--primary)]",
  },
  open: {
    icon: MessageCircle,
    badge: <Badge variant="success">OPEN</Badge>,
    iconColor: "text-emerald-400",
  },
  closed: {
    icon: Ban,
    badge: <Badge variant="neutral">CLOSED</Badge>,
    iconColor: "text-[var(--outline)]",
  },
};

export function PullRequestList({ prs }: PullRequestListProps) {
  return (
    <div className="flex flex-col gap-1">
      {prs.map((pr) => {
        const { icon: Icon, badge, iconColor } = statusConfig[pr.status];
        return (
          <div
            key={pr.id}
            className="flex items-center gap-3 px-3 py-3 rounded-md hover:bg-[var(--surface-container-high)] transition-colors cursor-pointer group"
          >
            <Icon size={16} className={iconColor} />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-[var(--on-surface)] truncate font-medium">{pr.title}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-label text-[var(--on-surface-variant)]">
                  {pr.repo} • #{pr.number}
                </span>
                {pr.reviewCount && (
                  <span className="text-xs font-label text-[var(--on-surface-variant)]">
                    • {pr.reviewCount} REVIEWS
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {badge}
              <span
                className={`text-xs font-label ${
                  pr.isActive ? "text-emerald-400" : "text-[var(--on-surface-variant)]"
                }`}
              >
                {pr.timeAgo}
              </span>
              <ChevronRight
                size={14}
                className="text-[var(--outline)] opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
