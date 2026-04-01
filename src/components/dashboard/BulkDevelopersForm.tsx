import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Trash2, Plus, Database, Upload } from "lucide-react";
import { invoke } from "@/lib/api";
import { DEVELOPER_SOURCES_CHANGED_EVENT } from "@/lib/app-events";
import { parseCsv, normalizeHeader } from "@/lib/csv";
import { DataSourcesChecklist } from "@/components/dashboard/DataSourcesChecklist";
import { Dialog } from "@/components/ui/Dialog";
import { useAppStatus } from "@/context/AppStatusContext";
import type { DataSource, Developer } from "@/lib/types";

function newRowId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface BulkRow {
  id: string;
  name: string;
  role: string;
  team: string;
  githubUsername: string;
  atlassianEmail: string;
  isCurrentUser: boolean;
  sourceIds: string[];
}

function emptyRow(): BulkRow {
  return {
    id: newRowId(),
    name: "",
    role: "",
    team: "",
    githubUsername: "",
    atlassianEmail: "",
    isCurrentUser: false,
    sourceIds: [],
  };
}

type RowKind = "empty" | "complete" | "partial";

function classifyRow(row: BulkRow): RowKind {
  const n = row.name.trim();
  const e = row.atlassianEmail.trim();
  if (!n && !e) return "empty";
  if (n && e) return "complete";
  return "partial";
}

interface BulkDevelopersFormProps {
  onCancel: () => void;
  /** Called after modal should close (all succeeded) or with partial success info */
  onComplete: (result: { createdIds: string[]; closed: boolean }) => void | Promise<void>;
}

export function BulkDevelopersForm({ onCancel, onComplete }: BulkDevelopersFormProps) {
  const [rows, setRows] = useState<BulkRow[]>(() => [emptyRow()]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { pushNotification } = useAppStatus();
  const [allSources, setAllSources] = useState<DataSource[]>([]);
  const [sourcesLoaded, setSourcesLoaded] = useState(false);
  const [pickerRowId, setPickerRowId] = useState<string | null>(null);
  const [pickerDraft, setPickerDraft] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await invoke<DataSource[]>("sources:list");
        if (!cancelled && Array.isArray(list)) setAllSources(list);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setSourcesLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pickerRow = useMemo(() => rows.find((r) => r.id === pickerRowId) ?? null, [rows, pickerRowId]);

  const openPicker = useCallback((rowId: string) => {
    const r = rows.find((x) => x.id === rowId);
    setPickerRowId(rowId);
    setPickerDraft(new Set(r?.sourceIds ?? []));
  }, [rows]);

  const savePicker = useCallback(() => {
    if (!pickerRowId) return;
    const ids = [...pickerDraft];
    setRows((prev) => prev.map((row) => (row.id === pickerRowId ? { ...row, sourceIds: ids } : row)));
    setPickerRowId(null);
  }, [pickerRowId, pickerDraft]);

  const applyPickerToAll = useCallback(() => {
    const ids = [...pickerDraft];
    setRows((prev) => prev.map((row) => ({ ...row, sourceIds: ids })));
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

  function setRowField(id: string, field: keyof BulkRow, value: string | boolean) {
    setRows((prev) =>
      prev.map((row) => {
        if (field === "isCurrentUser") {
          if (value === true) return { ...row, isCurrentUser: row.id === id };
          if (row.id === id) return { ...row, isCurrentUser: false };
          return row;
        }
        if (row.id !== id) return row;
        return { ...row, [field]: value } as BulkRow;
      }),
    );
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
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

      const imported: BulkRow[] = [];
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
        });
      });

      if (imported.length === 0) {
        setError("No usable rows found in the CSV.");
        return;
      }

      setRows((prev) => [...prev, ...imported]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Failed to import CSV.");
    } finally {
      e.target.value = "";
    }
  }

  function removeRow(id: string) {
    setPickerRowId((p) => (p === id ? null : p));
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  }

  const validation = useMemo(() => {
    const complete: BulkRow[] = [];
    const partial: BulkRow[] = [];
    for (const row of rows) {
      const k = classifyRow(row);
      if (k === "complete") complete.push(row);
      else if (k === "partial") partial.push(row);
    }
    return { complete, partial, completeCount: complete.length };
  }, [rows]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (validation.partial.length > 0) {
      const label = validation.partial[0].name.trim() || "(unnamed row)";
      setError(
        `Each row must have name and work email filled in, or leave the row empty. Fix row starting with "${label.slice(0, 40)}${label.length > 40 ? "…" : ""}".`,
      );
      return;
    }

    if (validation.completeCount === 0) {
      setError("Add at least one developer with name and work email.");
      return;
    }

    const toCreate = validation.complete;
    setSubmitting(true);
    const createdIds: string[] = [];
    try {
      for (let i = 0; i < toCreate.length; i++) {
        const row = toCreate[i];
        setProgress({ current: i + 1, total: toCreate.length });
        try {
          const dev = await invoke<Developer>("developers:create", {
            name: row.name.trim(),
            role: row.role.trim() || "Unassigned",
            team: row.team.trim() || "Unassigned",
            isCurrentUser: row.isCurrentUser,
            githubUsername: row.githubUsername.trim() || undefined,
            atlassianEmail: row.atlassianEmail.trim() || undefined,
          });
          createdIds.push(dev.id);
          if (row.sourceIds.length > 0) {
            await invoke("developers:sources:set", { id: dev.id, sourceIds: row.sourceIds });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const rowLabel = row.name.trim() || `Row ${i + 1}`;
          setError(`Failed on "${rowLabel}": ${msg}`);
          window.dispatchEvent(new Event(DEVELOPER_SOURCES_CHANGED_EVENT));
          await onComplete({ createdIds, closed: false });
          return;
        }
      }
      window.dispatchEvent(new Event(DEVELOPER_SOURCES_CHANGED_EVENT));
      await onComplete({ createdIds, closed: true });
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  }

  const inputCls =
    "w-full min-w-0 bg-[var(--surface-container-lowest)] text-[var(--on-surface)] text-xs rounded-md px-2 py-1.5 outline-none focus:ring-1 focus:ring-[var(--primary)] placeholder:text-[var(--outline)]";

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col w-full">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-6 pb-4">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
          <p className="text-sm text-[var(--on-surface-variant)]">
            Add several developers in one go. Each row needs name and work email (Jira and Linear assignee, Confluence).
            Role and team are optional and will default to "Unassigned" if left blank. CSV import supports headers: name,
            email, github_username, role, team.
          </p>

          <div className="overflow-x-auto rounded-lg border border-[var(--outline-variant)]/25">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--outline-variant)]/25 bg-[var(--surface-container-low)]">
                  <th className="px-2 py-2 text-[10px] font-label uppercase tracking-wider text-[var(--on-surface-variant)]">Name</th>
                  <th className="px-2 py-2 text-[10px] font-label uppercase tracking-wider text-[var(--on-surface-variant)]">Role</th>
                  <th className="px-2 py-2 text-[10px] font-label uppercase tracking-wider text-[var(--on-surface-variant)]">Team</th>
                  <th className="px-2 py-2 text-[10px] font-label uppercase tracking-wider text-[var(--on-surface-variant)]">GitHub</th>
                  <th className="px-2 py-2 text-[10px] font-label uppercase tracking-wider text-[var(--on-surface-variant)]">Work email</th>
                  <th className="px-2 py-2 text-[10px] font-label uppercase tracking-wider text-[var(--on-surface-variant)] text-center w-14">Me</th>
                  <th className="px-2 py-2 text-[10px] font-label uppercase tracking-wider text-[var(--on-surface-variant)]">Sources</th>
                  <th className="w-10 px-1 py-2" aria-label="Remove row" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--outline-variant)]/15 hover:bg-[var(--surface-container-low)]/40">
                    <td className="p-1.5 align-middle">
                      <input
                        className={inputCls}
                        value={row.name}
                        onChange={(e) => setRowField(row.id, "name", e.target.value)}
                        placeholder="Name"
                        aria-label="Full name"
                      />
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
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--outline-variant)]/40 px-2 py-1 text-xs text-[var(--on-surface)] hover:bg-[var(--surface-container-high)]"
                      >
                        <Database size={12} className="shrink-0 opacity-70" />
                        {row.sourceIds.length === 0 ? "None" : `${row.sourceIds.length} selected`}
                      </button>
                    </td>
                    <td className="p-1 align-middle">
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        disabled={rows.length <= 1}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--on-surface-variant)] hover:bg-[var(--error)]/10 hover:text-[var(--error)] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--on-surface-variant)]"
                        aria-label="Remove row"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={addRow}
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-[var(--primary)] hover:bg-[var(--primary)]/10"
            >
              <Plus size={16} />
              Add row
            </button>
            <button
              type="button"
              onClick={triggerCsvImport}
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-[var(--on-surface)] border border-[var(--outline-variant)]/40 hover:bg-[var(--surface-container-high)]"
            >
              <Upload size={16} />
              Import CSV
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleCsvFile}
              className="hidden"
            />
          </div>

          {!sourcesLoaded && <p className="text-xs text-[var(--on-surface-variant)]">Loading data sources…</p>}

          {error && (
            <p className="text-xs text-[var(--error)] bg-[var(--error)]/10 rounded-md px-3 py-2">{error}</p>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-[var(--outline-variant)]/20 bg-[var(--surface-container-highest)] px-6 py-4">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={submitting || validation.completeCount === 0}
            className="flex-1 min-w-[160px] py-2 bg-gradient-to-r from-[var(--primary)] to-[var(--primary-container)] text-[var(--on-primary)] text-sm font-semibold rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {submitting && progress
              ? `Adding ${progress.current} of ${progress.total}…`
              : `Add ${validation.completeCount} developer${validation.completeCount === 1 ? "" : "s"}`}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 bg-[var(--surface-container-high)] text-[var(--on-surface-variant)] text-sm font-medium rounded-md hover:bg-[var(--surface-bright)] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>

      <Dialog
        open={pickerRowId !== null}
        onClose={() => setPickerRowId(null)}
        title={pickerRow ? `Data sources — ${pickerRow.name.trim() || "Developer"}` : "Data sources"}
      >
        {allSources.length === 0 ? (
          <p className="text-sm text-[var(--on-surface-variant)]">No data sources configured. Add connections and sources in Settings first.</p>
        ) : (
          <>
            <DataSourcesChecklist
              sources={allSources}
              selectedIds={pickerDraft}
              onToggle={togglePickerSource}
            />
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
    </form>
  );
}
