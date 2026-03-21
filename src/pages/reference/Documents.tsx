import { useEffect, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/DataTable";
import { invoke } from "@/lib/api";

interface DocumentRow {
  developerName: string;
  pageId: string;
  title: string;
  spaceKey: string;
  versionCount: number;
  viewCount: number;
  lastModified: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const col = createColumnHelper<DocumentRow>();

const columns = [
  col.accessor("developerName", { header: "Developer", cell: (i) => <span className="text-xs font-label">{i.getValue()}</span> }),
  col.accessor("spaceKey", { header: "Space", cell: (i) => <span className="text-xs font-mono text-[var(--on-surface-variant)]">{i.getValue()}</span> }),
  col.accessor("title", {
    header: "Title",
    cell: (i) => <span className="text-sm text-[var(--on-surface)] truncate block max-w-sm">{i.getValue()}</span>,
  }),
  col.accessor("versionCount", { header: "Edits", cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
  col.accessor("viewCount", { header: "Views", cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
  col.accessor("lastModified", {
    header: "Last Modified",
    cell: (i) => <span className="text-xs text-[var(--on-surface-variant)] whitespace-nowrap">{formatDate(i.getValue())}</span>,
  }),
];

export default function DocumentsPage() {
  const [data, setData] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoke<DocumentRow[]>("reference:documents")
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
        <h2 className="text-base font-semibold text-[var(--on-surface)]">Documents</h2>
        <p className="text-xs font-label text-[var(--on-surface-variant)] mt-0.5">All cached Confluence pages from synced spaces</p>
      </div>
      <DataTable columns={columns} data={data} searchPlaceholder="Search documents..." />
    </div>
  );
}
