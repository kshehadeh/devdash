"use client";

import { useEffect, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { ExternalLink } from "lucide-react";
import { DataTable } from "../../components/ui/DataTable";
import { Badge } from "../../components/ui/Badge";

interface TicketRow {
  developerName: string;
  issueKey: string;
  summary: string;
  status: string;
  statusCategory: string;
  projectKey: string;
  updatedAt: string;
  url: string;
}

const categoryVariant: Record<string, "success" | "tertiary" | "neutral"> = {
  done: "success",
  in_progress: "tertiary",
  todo: "neutral",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const col = createColumnHelper<TicketRow>();

const columns = [
  col.accessor("developerName", { header: "Developer", cell: (i) => <span className="text-xs font-label">{i.getValue()}</span> }),
  col.accessor("projectKey", { header: "Project", cell: (i) => <span className="text-xs font-mono text-[var(--on-surface-variant)]">{i.getValue()}</span> }),
  col.accessor("issueKey", {
    header: "Key",
    cell: (i) => (
      <a
        href={i.row.original.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 group"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-xs font-mono font-semibold whitespace-nowrap overflow-hidden truncate max-w-[8rem] group-hover:text-[var(--primary)] transition-colors">{i.getValue()}</span>
        <ExternalLink size={10} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-[var(--primary)]" />
      </a>
    ),
  }),
  col.accessor("summary", {
    header: "Summary",
    cell: (i) => <span className="text-sm text-[var(--on-surface)] truncate block max-w-sm">{i.getValue()}</span>,
  }),
  col.accessor("status", {
    header: "Status",
    cell: (i) => (
      <Badge variant={categoryVariant[i.row.original.statusCategory] ?? "neutral"} className="max-w-[10rem] truncate block whitespace-nowrap overflow-hidden">
        {i.getValue()}
      </Badge>
    ),
  }),
  col.accessor("updatedAt", {
    header: "Updated",
    cell: (i) => <span className="text-xs text-[var(--on-surface-variant)] whitespace-nowrap">{formatDate(i.getValue())}</span>,
  }),
];

export default function TicketsPage() {
  const [data, setData] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/reference/tickets")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setData(d); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-sm text-[var(--on-surface-variant)]">Loading...</div>;
  }

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-base font-semibold text-[var(--on-surface)]">Tickets</h2>
        <p className="text-xs font-label text-[var(--on-surface-variant)] mt-0.5">All cached Jira tickets from synced projects</p>
      </div>
      <DataTable columns={columns} data={data} searchPlaceholder="Search tickets..." />
    </div>
  );
}
