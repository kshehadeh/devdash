"use client";

import type React from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "../ui/Badge";
import type { JiraTicket } from "../../../lib/types";

interface JiraTicketListProps {
  tickets: JiraTicket[];
}

const priorityDot: Record<JiraTicket["priority"], string> = {
  critical: "bg-[var(--error)]",
  high: "bg-amber-400",
  medium: "bg-[var(--primary)]",
  low: "bg-[var(--outline)]",
};

const categoryBadge: Record<JiraTicket["statusCategory"], React.ReactElement> = {
  todo: <Badge variant="neutral">TO DO</Badge>,
  in_progress: <Badge variant="tertiary">IN PROGRESS</Badge>,
  done: <Badge variant="success">DONE</Badge>,
};

export function JiraTicketList({ tickets }: JiraTicketListProps) {
  if (tickets.length === 0) {
    return (
      <p className="text-xs text-[var(--on-surface-variant)] py-4 text-center">
        No open tickets found in this period.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {tickets.map((ticket) => (
        <a
          key={ticket.id}
          href={ticket.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-[var(--surface-container-high)] transition-colors group"
        >
          <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${priorityDot[ticket.priority]}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-label text-[var(--on-surface-variant)]">{ticket.key}</span>
              <span className="text-[10px] font-label text-[var(--on-surface-variant)]/60">{ticket.type}</span>
            </div>
            <div className="text-sm text-[var(--on-surface)] truncate font-medium">{ticket.title}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {categoryBadge[ticket.statusCategory]}
            <span className="text-xs font-label text-[var(--on-surface-variant)]">
              {ticket.updatedAgo}
            </span>
            <ExternalLink
              size={12}
              className="text-[var(--outline)] opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </div>
        </a>
      ))}
    </div>
  );
}
