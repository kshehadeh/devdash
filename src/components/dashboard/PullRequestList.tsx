"use client";

import { GitMerge, MessageCircle, ChevronRight, AlertTriangle } from "lucide-react";
import { Badge } from "../ui/Badge";
import { useContextMenu } from "@/hooks/useContextMenu";
import type { PullRequest } from "../../../lib/types";

interface PullRequestListProps {
  prs: PullRequest[];
}

const STALE_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

function isStale(pr: PullRequest): boolean {
  if (pr.status !== "open") return false;
  return Date.now() - new Date(pr.updatedAt).getTime() > STALE_THRESHOLD_MS;
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
};

export function PullRequestList({ prs }: PullRequestListProps) {
  const visible = prs.filter((pr) => pr.status !== "closed");
  const { showContextMenu } = useContextMenu();

  if (visible.length === 0) {
    return (
      <p className="text-sm text-[var(--on-surface-variant)] py-3">No open or merged pull requests.</p>
    );
  }

  const handleContextMenu = (e: React.MouseEvent, pr: PullRequest) => {
    e.preventDefault();
    showContextMenu({
      title: pr.title,
      url: pr.url,
      itemType: "pr",
    });
  };

  return (
    <div className="flex flex-col gap-1">
      {visible.map((pr) => {
        const config = statusConfig[pr.status as keyof typeof statusConfig];
        const { icon: Icon, badge, iconColor } = config;
        const stale = isStale(pr);

        return (
          <a
            key={pr.id}
            href={pr.url}
            target="_blank"
            rel="noopener noreferrer"
            onContextMenu={(e) => handleContextMenu(e, pr)}
            className={`flex items-center gap-3 px-3 py-3 rounded-md transition-colors cursor-pointer group ${
              stale
                ? "bg-amber-400/8 border border-amber-400/20 hover:bg-amber-400/15"
                : "hover:bg-[var(--surface-container-high)]"
            }`}
          >
            <Icon size={16} className={stale ? "text-amber-400" : iconColor} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--on-surface)] truncate font-medium">{pr.title}</span>
                {stale && (
                  <span className="shrink-0 flex items-center gap-1 text-[10px] font-label font-semibold text-amber-400 uppercase tracking-wider">
                    <AlertTriangle size={10} />
                    Stale
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-label text-[var(--on-surface-variant)]">
                  {pr.repo} • #{pr.number}
                </span>
                {pr.reviewCount != null && pr.reviewCount > 0 && (
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
                  stale ? "text-amber-400" : pr.isActive ? "text-emerald-400" : "text-[var(--on-surface-variant)]"
                }`}
              >
                {pr.timeAgo}
              </span>
              <ChevronRight
                size={14}
                className="text-[var(--outline)] opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </div>
          </a>
        );
      })}
    </div>
  );
}
