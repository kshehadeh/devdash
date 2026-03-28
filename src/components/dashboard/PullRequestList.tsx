"use client";

import { GitMerge, MessageCircle, ChevronRight, AlertTriangle } from "lucide-react";
import { Badge } from "../ui/Badge";
import { useContextMenu } from "@/hooks/useContextMenu";
import type { PullRequest } from "../../../lib/types";

interface PullRequestListProps {
  prs: PullRequest[];
  /** Days open with zero reviews before warning badge (default 3) */
  staleWarnDays?: number;
  /** Days open with zero reviews before danger badge (default 7) */
  staleDangerDays?: number;
}

const DEFAULT_WARN = 3;
const DEFAULT_DANGER = 7;

function staleLevel(
  pr: PullRequest,
  warnDays: number,
  dangerDays: number,
): "warn" | "danger" | null {
  if (pr.status !== "open") return null;
  const reviews = pr.reviewCount ?? 0;
  if (reviews > 0) return null;
  const ageDays = (Date.now() - new Date(pr.createdAt).getTime()) / 86400000;
  if (ageDays >= dangerDays) return "danger";
  if (ageDays >= warnDays) return "warn";
  return null;
}

function formatShortDuration(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "";
  const d = Math.floor(ms / 86400000);
  if (d >= 1) return `${d}d`;
  const h = Math.floor(ms / 3600000);
  if (h >= 1) return `${h}h`;
  return "<1h";
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

export function PullRequestList({
  prs,
  staleWarnDays = DEFAULT_WARN,
  staleDangerDays = DEFAULT_DANGER,
}: PullRequestListProps) {
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
        const level = staleLevel(pr, staleWarnDays, staleDangerDays);
        const stale = level !== null;
        const rowClass =
          level === "danger"
            ? "bg-red-500/8 border border-red-500/25 hover:bg-red-500/12"
            : level === "warn"
              ? "bg-amber-400/8 border border-amber-400/20 hover:bg-amber-400/15"
              : "hover:bg-[var(--surface-container-high)]";

        const mergeHint =
          pr.status === "merged" && pr.mergedAt
            ? `Merged ${formatShortDuration(pr.mergedAt)} ago`
            : null;

        return (
          <a
            key={pr.id}
            href={pr.url}
            target="_blank"
            rel="noopener noreferrer"
            onContextMenu={(e) => handleContextMenu(e, pr)}
            className={`flex items-center gap-3 px-3 py-3 rounded-md transition-colors cursor-pointer group ${rowClass}`}
          >
            <Icon size={16} className={stale ? (level === "danger" ? "text-red-400" : "text-amber-400") : iconColor} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--on-surface)] truncate font-medium">{pr.title}</span>
                {level === "danger" && (
                  <span className="shrink-0 flex items-center gap-1 text-[10px] font-label font-semibold text-red-400 uppercase tracking-wider">
                    <AlertTriangle size={10} />
                    Stale
                  </span>
                )}
                {level === "warn" && (
                  <span className="shrink-0 flex items-center gap-1 text-[10px] font-label font-semibold text-amber-400 uppercase tracking-wider">
                    <AlertTriangle size={10} />
                    Needs review
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-xs font-label text-[var(--on-surface-variant)]">
                  {pr.repo} • #{pr.number}
                </span>
                {pr.reviewCount != null && pr.reviewCount > 0 && (
                  <span className="text-xs font-label text-[var(--on-surface-variant)]">
                    • {pr.reviewCount} REVIEWS
                  </span>
                )}
                {mergeHint && (
                  <span className="text-xs font-label text-[var(--on-surface-variant)]">• {mergeHint}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {badge}
              <span
                className={`text-xs font-label ${
                  stale ? (level === "danger" ? "text-red-400" : "text-amber-400") : pr.isActive ? "text-emerald-400" : "text-[var(--on-surface-variant)]"
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
