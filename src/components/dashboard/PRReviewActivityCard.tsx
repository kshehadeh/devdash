"use client";

import { Github, MessageSquare } from "lucide-react";
import { Card } from "@/components/ui/Card";

/** Max width for dashboard PR metric tiles (title + number). */
export const PR_METRIC_CARD_CLASS = "w-full max-w-[280px] shrink-0";

interface PRCommentsGivenCardProps {
  commentsGiven: number;
  lookbackDays: number;
}

export function PRCommentsGivenCard({ commentsGiven, lookbackDays }: PRCommentsGivenCardProps) {
  return (
    <Card className={PR_METRIC_CARD_CLASS}>
      <div className="flex items-center gap-2 mb-3">
        <Github size={16} className="text-[var(--primary)] shrink-0" />
        <h3 className="text-sm font-semibold text-[var(--on-surface)] leading-tight">Comments left</h3>
      </div>
      <p className="text-[10px] font-label text-[var(--on-surface-variant)] uppercase tracking-wider mb-2">
        Last {lookbackDays} days
      </p>
      <p className="text-3xl font-bold tabular-nums text-[var(--on-surface)]">{commentsGiven.toLocaleString()}</p>
      <p className="text-[10px] text-[var(--on-surface-variant)] mt-2 leading-snug">
        Inline review comments you wrote
      </p>
    </Card>
  );
}

interface PRApprovalsGivenCardProps {
  approvalsGiven: number;
  lookbackDays: number;
}

export function PRApprovalsGivenCard({ approvalsGiven, lookbackDays }: PRApprovalsGivenCardProps) {
  return (
    <Card className={PR_METRIC_CARD_CLASS}>
      <div className="flex items-center gap-2 mb-3">
        <Github size={16} className="text-[var(--primary)] shrink-0" />
        <h3 className="text-sm font-semibold text-[var(--on-surface)] leading-tight">Approvals</h3>
      </div>
      <p className="text-[10px] font-label text-[var(--on-surface-variant)] uppercase tracking-wider mb-2">
        Last {lookbackDays} days
      </p>
      <p className="text-3xl font-bold tabular-nums text-[var(--on-surface)]">{approvalsGiven.toLocaleString()}</p>
      <p className="text-[10px] text-[var(--on-surface-variant)] mt-2 leading-snug">PR reviews with approve</p>
    </Card>
  );
}

interface PRCommentsReceivedCardProps {
  commentsReceived: number;
  lookbackDays: number;
}

export function PRCommentsReceivedCard({ commentsReceived, lookbackDays }: PRCommentsReceivedCardProps) {
  return (
    <Card className={PR_METRIC_CARD_CLASS}>
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare size={16} className="text-[var(--primary)] shrink-0" />
        <h3 className="text-sm font-semibold text-[var(--on-surface)] leading-tight">PR comments received</h3>
      </div>
      <p className="text-[10px] font-label text-[var(--on-surface-variant)] uppercase tracking-wider mb-2">
        Last {lookbackDays} days
      </p>
      <p className="text-3xl font-bold tabular-nums text-[var(--on-surface)]">{commentsReceived.toLocaleString()}</p>
      <p className="text-[10px] text-[var(--on-surface-variant)] mt-2 leading-snug">
        On your PRs — inline + conversation (synced repos)
      </p>
    </Card>
  );
}
