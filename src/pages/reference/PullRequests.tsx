import { useEffect, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { ExternalLink } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { invoke } from "@/lib/api";

interface PRRow {
  developerName: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  status: string;
  reviewCount: number;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
}

const statusVariant: Record<string, "success" | "primary" | "neutral"> = {
  open: "success",
  merged: "primary",
  closed: "neutral",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const col = createColumnHelper<PRRow>();

const columns = [
  col.accessor("developerName", { header: "Developer", cell: (i) => <span className="text-xs font-label">{i.getValue()}</span> }),
  col.accessor("repo", { header: "Repository", cell: (i) => <span className="text-xs font-mono text-[var(--on-surface-variant)]">{i.getValue()}</span> }),
  col.accessor("number", { header: "#", cell: (i) => <span className="text-xs font-mono">#{i.getValue()}</span> }),
  col.accessor("title", {
    header: "Title",
    cell: (i) => (
      <a
        href={i.row.original.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-sm text-[var(--on-surface)] hover:text-[var(--primary)] transition-colors group"
      >
        <span className="truncate max-w-xs">{i.getValue()}</span>
        <ExternalLink size={11} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </a>
    ),
  }),
  col.accessor("status", {
    header: "Status",
    cell: (i) => <Badge variant={statusVariant[i.getValue()] ?? "neutral"}>{i.getValue().toUpperCase()}</Badge>,
  }),
  col.accessor("reviewCount", { header: "Reviews", cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
  col.accessor("createdAt", { header: "Created", cell: (i) => <span className="text-xs text-[var(--on-surface-variant)] whitespace-nowrap">{formatDate(i.getValue())}</span> }),
  col.accessor("updatedAt", { header: "Updated", cell: (i) => <span className="text-xs text-[var(--on-surface-variant)] whitespace-nowrap">{formatDate(i.getValue())}</span> }),
];

export default function PullRequestsPage() {
  const [data, setData] = useState<PRRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoke<PRRow[]>("reference:pull-requests")
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
        <h2 className="text-base font-semibold text-[var(--on-surface)]">Pull Requests</h2>
        <p className="text-xs font-label text-[var(--on-surface-variant)] mt-0.5">All cached pull requests from synced repositories</p>
      </div>
      <DataTable columns={columns} data={data} searchPlaceholder="Search pull requests..." />
    </div>
  );
}
