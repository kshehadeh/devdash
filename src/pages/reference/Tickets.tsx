import { useEffect, useState, useCallback } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { ExternalLink } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { invoke } from "@/lib/api";
import type React from "react";

interface TicketRow {
  developerName: string;
  developerId: string;
  issueKey: string;
  summary: string;
  status: string;
  statusCategory: string;
  projectKey: string;
  updatedAt: string;
  url: string;
  source: "jira" | "linear";
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

function buildColumns(onInvalidTicket: (issueKey: string) => void) {
  function handleKeyClick(e: React.MouseEvent, row: TicketRow) {
    e.stopPropagation();
    if (row.source !== "jira" || !row.developerId) return;
    invoke<{ exists: boolean }>("jira:ticket:validate", { issueKey: row.issueKey, developerId: row.developerId })
      .then((result) => { if (!result.exists) onInvalidTicket(row.issueKey); })
      .catch(() => { /* ignore validation errors */ });
  }

  return [
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
          onClick={(e) => handleKeyClick(e, i.row.original)}
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
}

export default function TicketsPage() {
  const [data, setData] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(() => {
    invoke<TicketRow[]>("reference:tickets")
      .then((d) => { if (Array.isArray(d)) setData(d); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleInvalidTicket = useCallback((issueKey: string) => {
    setData((prev) => prev.filter((r) => r.issueKey !== issueKey));
  }, []);

  const columns = buildColumns(handleInvalidTicket);

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
