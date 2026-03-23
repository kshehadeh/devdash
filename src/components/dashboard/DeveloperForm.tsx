import { useState, useEffect } from "react";
import { Github, Kanban, BookOpen, ListTree } from "lucide-react";
import { invoke } from "@/lib/api";
import { DEVELOPER_SOURCES_CHANGED_EVENT } from "@/lib/app-events";
import type { Developer, DataSource, DataSourceType } from "@/lib/types";

interface FormValues {
  name: string;
  role: string;
  team: string;
  isCurrentUser: boolean;
  githubUsername: string;
  atlassianEmail: string;
}

interface DeveloperFormProps {
  initial?: Developer;
  onSubmit: (values: FormValues) => Promise<Developer | void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
  submitLabel?: string;
  /** When adding a developer, load sources and persist `developers:sources:set` after create. */
  assignSourcesForNew?: boolean;
  /** Called after submit and source assignment succeed. */
  onSuccess?: () => void | Promise<void>;
}

const SOURCE_ICONS: Record<DataSourceType, typeof Github> = {
  github_repo: Github,
  jira_project: Kanban,
  confluence_space: BookOpen,
  linear_team: ListTree,
};

function InputField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
        {label}
        {required && <span className="text-[var(--error)] ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full bg-[var(--surface-container-lowest)] text-[var(--on-surface)] text-sm rounded-md px-3 py-2 outline-none focus:ring-1 focus:ring-[var(--primary)] placeholder:text-[var(--outline)]"
      />
    </div>
  );
}

export function DeveloperForm({
  initial,
  onSubmit,
  onCancel,
  onDelete,
  submitLabel = "Save",
  assignSourcesForNew = false,
  onSuccess,
}: DeveloperFormProps) {
  const [values, setValues] = useState<FormValues>({
    name: initial?.name ?? "",
    role: initial?.role ?? "",
    team: initial?.team ?? "",
    isCurrentUser: initial?.isCurrentUser ?? false,
    githubUsername: initial?.githubUsername ?? "",
    atlassianEmail: initial?.atlassianEmail ?? "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Source associations (only shown when editing an existing developer)
  const [allSources, setAllSources] = useState<DataSource[]>([]);
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [sourcesLoaded, setSourcesLoaded] = useState(false);

  useEffect(() => {
    if (initial) {
      const initialId = initial.id;
      async function load() {
        try {
          const [allData, assignedData] = await Promise.all([
            invoke<DataSource[]>("sources:list"),
            invoke<DataSource[]>("developers:sources:get", { id: initialId }),
          ]);
          if (Array.isArray(allData)) setAllSources(allData);
          if (Array.isArray(assignedData)) setAssignedIds(new Set(assignedData.map((s: DataSource) => s.id)));
        } catch {
          /* ignore */
        } finally {
          setSourcesLoaded(true);
        }
      }
      load();
      return;
    }
    if (assignSourcesForNew) {
      async function loadNew() {
        try {
          const allData = await invoke<DataSource[]>("sources:list");
          if (Array.isArray(allData)) setAllSources(allData);
        } catch {
          /* ignore */
        } finally {
          setSourcesLoaded(true);
        }
      }
      loadNew();
      return;
    }
    setSourcesLoaded(false);
    setAllSources([]);
    setAssignedIds(new Set());
  }, [initial, assignSourcesForNew]);

  function set(field: keyof FormValues) {
    return (v: string) => setValues((prev) => ({ ...prev, [field]: v }));
  }

  function toggleSource(sourceId: string) {
    setAssignedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sourceId)) next.delete(sourceId);
      else next.add(sourceId);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await onSubmit(values);
      if (sourcesLoaded) {
        if (initial) {
          await invoke("developers:sources:set", { id: initial.id, sourceIds: [...assignedIds] });
          window.dispatchEvent(new Event(DEVELOPER_SOURCES_CHANGED_EVENT));
        } else if (assignSourcesForNew && result && typeof result === "object" && "id" in result) {
          await invoke("developers:sources:set", {
            id: (result as Developer).id,
            sourceIds: [...assignedIds],
          });
          window.dispatchEvent(new Event(DEVELOPER_SOURCES_CHANGED_EVENT));
        }
      }
      await onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col w-full">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-6 pb-4">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <InputField label="Full Name" value={values.name} onChange={set("name")} placeholder="Alex Chen" required />
            </div>
            <InputField label="Role" value={values.role} onChange={set("role")} placeholder="Senior Frontend Engineer" required />
            <InputField label="Team" value={values.team} onChange={set("team")} placeholder="Ateliers" required />
          </div>
          <label className="flex items-start gap-2.5 rounded-md px-3 py-2 bg-[var(--surface-container-low)] border border-[var(--outline-variant)]/20">
            <input
              type="checkbox"
              checked={values.isCurrentUser}
              onChange={(e) => setValues((prev) => ({ ...prev, isCurrentUser: e.target.checked }))}
              className="mt-0.5 accent-[var(--primary)] w-3.5 h-3.5"
            />
            <span className="text-sm text-[var(--on-surface)]">
              This is me
              <span className="block text-xs text-[var(--on-surface-variant)] mt-0.5">
                Mark this developer as YOU for personalized activity and notifications. This unsets any previous YOU.
              </span>
            </span>
          </label>

          <div className="border-t border-[var(--outline-variant)]/20 pt-3 mt-1 flex flex-col gap-3">
            <p className="text-xs font-label text-[var(--on-surface-variant)]">
              Optional — used for API integrations
            </p>
            <InputField
              label="GitHub Username"
              value={values.githubUsername}
              onChange={set("githubUsername")}
              placeholder="alexchen"
            />
            <InputField
              label="Atlassian Email"
              value={values.atlassianEmail}
              onChange={set("atlassianEmail")}
              type="email"
              placeholder="alex.chen@underarmour.com"
            />
          </div>

          {sourcesLoaded && allSources.length > 0 && (initial || assignSourcesForNew) && (
            <div className="border-t border-[var(--outline-variant)]/20 pt-3 mt-1">
              <p className="text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider mb-2">
                Assigned Data Sources
              </p>
              <div className="flex flex-col gap-1">
                {allSources.map((source) => {
                  const Icon = SOURCE_ICONS[source.type];
                  const checked = assignedIds.has(source.id);
                  return (
                    <label
                      key={source.id}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-[var(--surface-container-high)] transition-colors cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSource(source.id)}
                        className="accent-[var(--primary)] w-3.5 h-3.5"
                      />
                      <Icon size={13} className="text-[var(--on-surface-variant)] shrink-0" />
                      <span className="text-sm text-[var(--on-surface)] flex-1 truncate">{source.name}</span>
                      <span className="text-[10px] text-[var(--on-surface-variant)] font-label">
                        {source.type === "github_repo"
                          ? `${source.org}/${source.identifier}`
                          : source.identifier}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-[var(--error)] bg-[var(--error)]/10 rounded-md px-3 py-2">
              {error}
            </p>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-[var(--outline-variant)]/20 bg-[var(--surface-container-highest)] px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 py-2 bg-gradient-to-r from-[var(--primary)] to-[var(--primary-container)] text-[var(--on-primary)] text-sm font-semibold rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {submitting ? "Saving..." : submitLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-[var(--surface-container-high)] text-[var(--on-surface-variant)] text-sm font-medium rounded-md hover:bg-[var(--surface-bright)] transition-colors"
          >
            Cancel
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2 text-[var(--error)] text-sm font-medium rounded-md hover:bg-[var(--error)]/10 transition-colors disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
