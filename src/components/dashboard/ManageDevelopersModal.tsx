import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Trash2, Plus, Database, Upload, Download } from "lucide-react";
import { invoke } from "@/lib/api";
import { DEVELOPER_SOURCES_CHANGED_EVENT } from "@/lib/app-events";
import { parseCsv, normalizeHeader } from "@/lib/csv";
import { DataSourcesChecklist } from "@/components/dashboard/DataSourcesChecklist";
import { FullWindowModal } from "@/components/ui/FullWindowModal";
import { Dialog } from "@/components/ui/Dialog";
import { useAppStatus } from "@/context/AppStatusContext";
import type { DataSource, Developer } from "@/lib/types";

function newRowId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

type RowStatus = "unchanged" | "modified" | "new" | "deleted";

interface Row {
  id: string;
  name: string;
  role: string;
  team: string;
  githubUsername: string;
  atlassianEmail: string;
  isCurrentUser: boolean;
  sourceIds: string[];
  status: RowStatus;
  originalId?: string; // For existing developers (unchanged/modified/deleted)
  originalName?: string; // Track original name to detect if modified
}

function emptyRow(): Row {
  return {
    id: newRowId(),
    name: "",
    role: "",
    team: "",
    githubUsername: "",
    atlassianEmail: "",
    isCurrentUser: false,
    sourceIds: [],
    status: "new",
  };
}

function createRowFromDeveloper(dev: Developer): Row {
  return {
    id: newRowId(),
    name: dev.name,
    role: dev.role,
    team: dev.team,
    githubUsername: dev.githubUsername ?? "",
    atlassianEmail: dev.atlassianEmail ?? "",
    isCurrentUser: dev.isCurrentUser,
    sourceIds: [],
    status: "unchanged",
    originalId: dev.id,
    originalName: dev.name,
  };
}

function classifyRow(row: Row): "empty" | "complete" | "partial" {
  const n = row.name.trim();
  const e = row.atlassianEmail.trim();
  if (!n && !e) return "empty";
  if (n && e) return "complete";
  return "partial";
}

interface ManageDevelopersModalProps {
  open: boolean;
  onClose: () => void;
  onDevelopersChange: () => Promise<void>;
  onSelect: (id: string) => void;
}

export function ManageDevelopersModal({
  open,
  onClose,
  onDevelopersChange,
  onSelect,
}: ManageDevelopersModalProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [allSources, setAllSources] = useState<DataSource[]>([]);
  const [sourcesLoaded, setSourcesLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { pushNotification } = useAppStatus();

  // Source picker state
  const [pickerRowId, setPickerRowId] = useState<string | null>(null);
  const [pickerDraft, setPickerDraft] = useState<Set<string>>(new Set());

  const pickerRow = useMemo(() => rows.find((r) => r.id === pickerRowId) ?? null, [rows, pickerRowId]);

  // Load data when modal opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedIds(new Set());

    async function load() {
      try {
        const [developers, sources] = await Promise.all([
          invoke<Developer[]>("developers:list"),
          invoke<DataSource[]>("sources:list"),
        ]);
        if (cancelled) return;

        if (Array.isArray(sources)) setAllSources(sources);
        setSourcesLoaded(true);

        if (Array.isArray(developers)) {
          // Load source assignments for each developer
          const rowsWithSources: Row[] = [];
          for (const dev of developers) {
            const row = createRowFromDeveloper(dev);
            try {
              const devSources = await invoke<DataSource[]>("developers:sources:get", { id: dev.id });
              if (Array.isArray(devSources)) {
                row.sourceIds = devSources.map((s) => s.id);
              }
            } catch {
              // Ignore errors for individual developer source loading
            }
            rowsWithSources.push(row);
          }
          if (!cancelled) setRows(rowsWithSources);
        } else {
          if (!cancelled) setRows([]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load developers");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const summary = useMemo(() => {
    const newCount = rows.filter((r) => r.status === "new" && classifyRow(r) === "complete").length;
    const modifiedCount = rows.filter((r) => r.status === "modified").length;
    const deletedCount = rows.filter((r) => r.status === "deleted").length;
    const selectedCount = selectedIds.size;
    return { newCount, modifiedCount, deletedCount, selectedCount };
  }, [rows, selectedIds]);

  function setRowField(id: string, field: keyof Row, value: string | boolean) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;

        // Handle isCurrentUser - only one can be current user
        if (field === "isCurrentUser" && value === true) {
          // Mark all other rows as not current user
          return { ...row, [field]: value } as Row;
        }

        const updated = { ...row, [field]: value } as Row;

        // Mark as modified if it was unchanged and is an existing row
        if (row.status === "unchanged" && row.originalId) {
          updated.status = "modified";
        }

        return updated;
      })
    );

    // If setting isCurrentUser to true, unset all others
    if (field === "isCurrentUser" && value === true) {
      setRows((prev) =>
        prev.map((row) =>
          row.id !== id && row.isCurrentUser
            ? { ...row, isCurrentUser: false, status: row.status === "unchanged" ? "modified" : row.status }
            : row
        )
      );
    }
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  function _removeRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        // If it's a new row, actually remove it
        if (row.status === "new") {
          return null;
        }
        // Otherwise mark as deleted
        return { ...row, status: "deleted" };
      }).filter(Boolean) as Row[]
    );
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const visibleRows = rows.filter((r) => r.status !== "deleted");
    const allSelected = visibleRows.every((r) => selectedIds.has(r.id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleRows.map((r) => r.id)));
    }
  }

  function triggerCsvImport() {
    setError(null);
    fileInputRef.current?.click();
  }

  async function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.headers.length === 0) {
        setError("CSV looks empty. Provide a header row with name and email.");
        return;
      }

      const headerIndex = new Map<string, number>();
      parsed.headers.forEach((h, i) => {
        const key = normalizeHeader(h);
        if (key) headerIndex.set(key, i);
      });

      const nameIdx = headerIndex.get("name");
      const emailIdx = headerIndex.get("email");
      if (nameIdx === undefined || emailIdx === undefined) {
        setError("CSV must include headers for name and email.");
        return;
      }

      const githubIdx = headerIndex.get("github_username");
      const roleIdx = headerIndex.get("role");
      const teamIdx = headerIndex.get("team");

      const imported: Row[] = [];
      parsed.rows.forEach((dataRow) => {
        const name = (dataRow[nameIdx] ?? "").trim();
        const email = (dataRow[emailIdx] ?? "").trim();
        const github = githubIdx !== undefined ? (dataRow[githubIdx] ?? "").trim() : "";
        const role = roleIdx !== undefined ? (dataRow[roleIdx] ?? "").trim() : "";
        const team = teamIdx !== undefined ? (dataRow[teamIdx] ?? "").trim() : "";

        if (!name && !email && !github && !role && !team) return;

        imported.push({
          id: newRowId(),
          name,
          role,
          team,
          githubUsername: github,
          atlassianEmail: email,
          isCurrentUser: false,
          sourceIds: [],
          status: "new",
        });
      });

      if (imported.length === 0) {
        setError("No usable rows found in the CSV.");
        return;
      }

      setRows((prev) => [...prev, ...imported]);
      pushNotification({ message: `Imported ${imported.length} developer${imported.length === 1 ? "" : "s"} from CSV.`, type: "success", ttlMs: 2500 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Failed to import CSV.");
    } finally {
      e.target.value = "";
    }
  }

  async function handleExport() {
    try {
      await invoke("settings:export");
      pushNotification({ message: "Settings exported successfully.", type: "success", ttlMs: 2500 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Export failed";
      setError(msg);
    }
  }

  function handleDeleteSelected() {
    if (summary.selectedCount === 0) return;
    setShowDeleteConfirm(true);
  }

  function confirmDeleteSelected() {
    setRows((prev) =>
      prev.map((row) => {
        if (!selectedIds.has(row.id)) return row;
        // If it's a new row, actually remove it
        if (row.status === "new") return null;
        // Otherwise mark as deleted
        return { ...row, status: "deleted" };
      }).filter(Boolean) as Row[]
    );
    setSelectedIds(new Set());
    setShowDeleteConfirm(false);
  }

  async function handleSave() {
    setError(null);

    // Validate all rows
    const incomplete = rows.find((r) => r.status !== "deleted" && classifyRow(r) === "partial");
    if (incomplete) {
      const label = incomplete.name.trim() || "(unnamed row)";
      setError(
        `Each row must have name and work email filled in, or leave the row empty. Fix row starting with "${label.slice(0, 40)}${label.length > 40 ? "…" : ""}".`
      );
      return;
    }

    const toCreate = rows.filter((r) => r.status === "new" && classifyRow(r) === "complete");
    const toUpdate = rows.filter((r) => r.status === "modified");
    const toDelete = rows.filter((r) => r.status === "deleted");

    if (toCreate.length === 0 && toUpdate.length === 0 && toDelete.length === 0) {
      onClose();
      return;
    }

    setSubmitting(true);
    const createdIds: string[] = [];
    const idMap = new Map<string, string>(); // old temp id -> new real id

    try {
      // Create new developers
      for (const row of toCreate) {
        const dev = await invoke<Developer>("developers:create", {
          name: row.name.trim(),
          role: row.role.trim() || "Unassigned",
          team: row.team.trim() || "Unassigned",
          isCurrentUser: row.isCurrentUser,
          githubUsername: row.githubUsername.trim() || undefined,
          atlassianEmail: row.atlassianEmail.trim() || undefined,
        });
        createdIds.push(dev.id);
        idMap.set(row.id, dev.id);

        if (row.sourceIds.length > 0) {
          await invoke("developers:sources:set", { id: dev.id, sourceIds: row.sourceIds });
        }
      }

      // Update modified developers
      for (const row of toUpdate) {
        if (!row.originalId) continue;
        await invoke("developers:update", {
          id: row.originalId,
          name: row.name.trim(),
          role: row.role.trim(),
          team: row.team.trim(),
          isCurrentUser: row.isCurrentUser,
          githubUsername: row.githubUsername.trim() || undefined,
          atlassianEmail: row.atlassianEmail.trim() || undefined,
        });

        await invoke("developers:sources:set", { id: row.originalId, sourceIds: row.sourceIds });
      }

      // Delete developers
      for (const row of toDelete) {
        if (!row.originalId) continue;
        await invoke("developers:delete", { id: row.originalId });
      }

      window.dispatchEvent(new Event(DEVELOPER_SOURCES_CHANGED_EVENT));
      await onDevelopersChange();

      // Select the last created developer if any, otherwise keep current selection
      if (createdIds.length > 0) {
        onSelect(createdIds[createdIds.length - 1]!);
      }

      pushNotification({
        message: `Saved: ${toCreate.length} added, ${toUpdate.length} updated, ${toDelete.length} removed.`,
        type: "success",
        ttlMs: 3000,
      });

      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save changes";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  // Source picker
  const openPicker = useCallback((rowId: string) => {
    const r = rows.find((x) => x.id === rowId);
    setPickerRowId(rowId);
    setPickerDraft(new Set(r?.sourceIds ?? []));
  }, [rows]);

  const savePicker = useCallback(() => {
    if (!pickerRowId) return;
    const ids = [...pickerDraft];
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== pickerRowId) return row;
        // Mark as modified if existing row
        const newStatus = row.status === "unchanged" ? "modified" : row.status;
        return { ...row, sourceIds: ids, status: newStatus };
      })
    );
    setPickerRowId(null);
  }, [pickerRowId, pickerDraft]);

  const applyPickerToAll = useCallback(() => {
    const ids = [...pickerDraft];
    setRows((prev) =>
      prev.map((row) => {
        const newStatus = row.status === "unchanged" ? "modified" : row.status;
        return { ...row, sourceIds: ids, status: newStatus };
      })
    );
    setPickerRowId(null);
    pushNotification({ message: "Applied sources to all rows.", type: "success", ttlMs: 2500 });
  }, [pickerDraft, pushNotification]);

  function togglePickerSource(sourceId: string) {
    setPickerDraft((prev) => {
      const next = new Set(prev);
      if (next.has(sourceId)) next.delete(sourceId);
      else next.add(sourceId);
      return next;
    });
  }

  const visibleRows = useMemo(() => rows.filter((r) => r.status !== "deleted"), [rows]);
  const allSelected = visibleRows.length > 0 && visibleRows.every((r) => selectedIds.has(r.id));

  const inputCls =
    "w-full min-w-0 bg-[var(--surface-container-lowest)] text-[var(--on-surface)] text-xs rounded-md px-2 py-1.5 outline-none focus:ring-1 focus:ring-[var(--primary)] placeholder:text-[var(--outline)]";

  return (
    <>
      <FullWindowModal
        open={open}
        onClose={onClose}
        title="Manage Developers"
        description="Add, edit, import, export, and remove developers. Changes are saved when you click Save Changes."
      >
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-[var(--on-surface-variant)]">Loading developers...</p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col w-full">
            {/* Toolbar */}
            <div className="shrink-0 border-b border-[var(--outline-variant)]/20 bg-[var(--surface-container-high)] px-6 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={addRow}
                  className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-[var(--primary)] hover:bg-[var(--primary)]/10 transition-colors"
                >
                  <Plus size={16} />
                  Add Row
                </button>
                <button
                  type="button"
                  onClick={triggerCsvImport}
                  className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-[var(--on-surface)] border border-[var(--outline-variant)]/40 hover:bg-[var(--surface-container)] transition-colors"
                >
                  <Upload size={16} />
                  Import CSV
                </button>
                <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleCsvFile} className="hidden" />
                <button
                  type="button"
                  onClick={handleExport}
                  className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-[var(--on-surface)] border border-[var(--outline-variant)]/40 hover:bg-[var(--surface-container)] transition-colors"
                >
                  <Download size={16} />
                  Export
                </button>
                {summary.selectedCount > 0 && (
                  <button
                    type="button"
                    onClick={handleDeleteSelected}
                    className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-[var(--error)] hover:bg-[var(--error)]/10 transition-colors"
                  >
                    <Trash2 size={16} />
                    Delete Selected ({summary.selectedCount})
                  </button>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-4">
              <div className="overflow-x-auto rounded-lg border border-[var(--outline-variant)]/25">
                <table className="w-full min-w-[720px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[var(--outline-variant)]/25 bg-[var(--surface-container-low)]">
                      <th className="w-10 px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          className="accent-[var(--primary)] w-3.5 h-3.5"
                          aria-label="Select all"
                        />
                      </th>
                      <th className="px-2 py-2 text-[10px] font-label uppercase tracking-wider text-[var(--on-surface-variant)]">Name</th>
                      <th className="px-2 py-2 text-[10px] font-label uppercase tracking-wider text-[var(--on-surface-variant)]">Role</th>
                      <th className="px-2 py-2 text-[10px] font-label uppercase tracking-wider text-[var(--on-surface-variant)]">Team</th>
                      <th className="px-2 py-2 text-[10px] font-label uppercase tracking-wider text-[var(--on-surface-variant)]">GitHub</th>
                      <th className="px-2 py-2 text-[10px] font-label uppercase tracking-wider text-[var(--on-surface-variant)]">Work Email</th>
                      <th className="px-2 py-2 text-[10px] font-label uppercase tracking-wider text-[var(--on-surface-variant)] text-center w-14">Me</th>
                      <th className="px-2 py-2 text-[10px] font-label uppercase tracking-wider text-[var(--on-surface-variant)]">Sources</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => {
                      const isNew = row.status === "new";
                      const rowClass = isNew
                        ? "border-l-2 border-l-[var(--primary)] bg-[var(--primary)]/5"
                        : "border-l-2 border-l-transparent";
                      return (
                        <tr
                          key={row.id}
                          className={`border-b border-[var(--outline-variant)]/15 hover:bg-[var(--surface-container-low)]/40 ${rowClass}`}
                        >
                          <td className="p-1.5 align-middle text-center">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(row.id)}
                              onChange={() => toggleSelect(row.id)}
                              className="accent-[var(--primary)] w-3.5 h-3.5"
                            />
                          </td>
                          <td className="p-1.5 align-middle">
                            <div className="flex items-center gap-1.5">
                              <input
                                className={inputCls}
                                value={row.name}
                                onChange={(e) => setRowField(row.id, "name", e.target.value)}
                                placeholder="Name"
                                aria-label="Full name"
                              />
                              {isNew && (
                                <span className="shrink-0 text-[9px] font-label tracking-wide px-1.5 py-0.5 rounded bg-[var(--primary)] text-[var(--on-primary)]">
                                  NEW
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-1.5 align-middle">
                            <input
                              className={inputCls}
                              value={row.role}
                              onChange={(e) => setRowField(row.id, "role", e.target.value)}
                              placeholder="Role"
                              aria-label="Role"
                            />
                          </td>
                          <td className="p-1.5 align-middle">
                            <input
                              className={inputCls}
                              value={row.team}
                              onChange={(e) => setRowField(row.id, "team", e.target.value)}
                              placeholder="Team"
                              aria-label="Team"
                            />
                          </td>
                          <td className="p-1.5 align-middle">
                            <input
                              className={inputCls}
                              value={row.githubUsername}
                              onChange={(e) => setRowField(row.id, "githubUsername", e.target.value)}
                              placeholder="login"
                              aria-label="GitHub username"
                            />
                          </td>
                          <td className="p-1.5 align-middle">
                            <input
                              className={inputCls}
                              type="email"
                              value={row.atlassianEmail}
                              onChange={(e) => setRowField(row.id, "atlassianEmail", e.target.value)}
                              placeholder="email"
                              aria-label="Work email"
                            />
                          </td>
                          <td className="p-1.5 align-middle text-center">
                            <input
                              type="checkbox"
                              checked={row.isCurrentUser}
                              onChange={(e) => setRowField(row.id, "isCurrentUser", e.target.checked)}
                              className="accent-[var(--primary)] w-3.5 h-3.5"
                              title="This is me"
                              aria-label="This is me"
                            />
                          </td>
                          <td className="p-1.5 align-middle">
                            <button
                              type="button"
                              onClick={() => openPicker(row.id)}
                              className="inline-flex items-center gap-1 rounded-md border border-[var(--outline-variant)]/40 px-2 py-1 text-xs text-[var(--on-surface)] hover:bg-[var(--surface-container-high)] transition-colors"
                            >
                              <Database size={12} className="shrink-0 opacity-70" />
                              {row.sourceIds.length === 0 ? "None" : `${row.sourceIds.length} selected`}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {visibleRows.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-6 py-8 text-center text-sm text-[var(--on-surface-variant)]">
                          No developers yet. Click "Add Row" or "Import CSV" to get started.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {!sourcesLoaded && <p className="mt-2 text-xs text-[var(--on-surface-variant)]">Loading data sources…</p>}

              {error && (
                <p className="mt-4 text-xs text-[var(--error)] bg-[var(--error)]/10 rounded-md px-3 py-2">{error}</p>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-[var(--outline-variant)]/20 bg-[var(--surface-container-highest)] px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="text-xs text-[var(--on-surface-variant)]">
                  {summary.newCount > 0 && <span className="mr-3">{summary.newCount} new</span>}
                  {summary.modifiedCount > 0 && <span className="mr-3">{summary.modifiedCount} modified</span>}
                  {summary.deletedCount > 0 && <span className="mr-3 text-[var(--error)]">{summary.deletedCount} to delete</span>}
                  {summary.newCount === 0 && summary.modifiedCount === 0 && summary.deletedCount === 0 && (
                    <span>No changes</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={submitting || (summary.newCount === 0 && summary.modifiedCount === 0 && summary.deletedCount === 0)}
                    className="px-6 py-2 bg-gradient-to-r from-[var(--primary)] to-[var(--primary-container)] text-[var(--on-primary)] text-sm font-semibold rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {submitting ? "Saving..." : "Save Changes"}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={submitting}
                    className="px-4 py-2 bg-[var(--surface-container-high)] text-[var(--on-surface-variant)] text-sm font-medium rounded-md hover:bg-[var(--surface-bright)] transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </FullWindowModal>

      {/* Source Picker Dialog */}
      <Dialog
        open={pickerRowId !== null}
        onClose={() => setPickerRowId(null)}
        title={pickerRow ? `Data sources — ${pickerRow.name.trim() || "Developer"}` : "Data sources"}
      >
        {allSources.length === 0 ? (
          <p className="text-sm text-[var(--on-surface-variant)]">
            No data sources configured. Add connections and sources in Settings first.
          </p>
        ) : (
          <>
            <DataSourcesChecklist sources={allSources} selectedIds={pickerDraft} onToggle={togglePickerSource} />
            <div className="mt-4 flex justify-end gap-2 border-t border-[var(--outline-variant)]/20 pt-4">
              <button
                type="button"
                onClick={() => setPickerRowId(null)}
                className="px-3 py-1.5 text-sm rounded-md bg-[var(--surface-container-high)] text-[var(--on-surface-variant)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={savePicker}
                className="px-3 py-1.5 text-sm rounded-md bg-[var(--primary)] text-[var(--on-primary)] font-medium"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={applyPickerToAll}
                className="px-3 py-1.5 text-sm rounded-md border border-[var(--outline-variant)]/40 bg-[var(--surface-container-high)] text-[var(--on-surface)]"
              >
                Apply to all
              </button>
            </div>
          </>
        )}
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Confirm Delete"
      >
        <p className="text-sm text-[var(--on-surface)]">
          Are you sure you want to delete {summary.selectedCount} developer{summary.selectedCount === 1 ? "" : "s"}?
          This action cannot be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2 border-t border-[var(--outline-variant)]/20 pt-4">
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(false)}
            className="px-3 py-1.5 text-sm rounded-md bg-[var(--surface-container-high)] text-[var(--on-surface-variant)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmDeleteSelected}
            className="px-3 py-1.5 text-sm rounded-md bg-[var(--error)] text-white font-medium"
          >
            Delete
          </button>
        </div>
      </Dialog>
    </>
  );
}
