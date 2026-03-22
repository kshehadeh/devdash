import { useState, useEffect, useCallback } from "react";
import {
  Github,
  Kanban,
  BookOpen,
  ListTree,
  Plus,
  Trash2,
  Pencil,
  Loader2,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SourceFormDialog, type SourceFormMode } from "@/components/settings/SourceFormDialog";
import type { DataSource, DataSourceType, JiraBoardRef } from "@/lib/types";
import { invoke } from "@/lib/api";

type IntegrationSettings = {
  code: "github";
  work: "jira" | "linear";
  docs: "confluence";
};

const TYPE_META: Record<DataSourceType, { icon: typeof Github; label: string; color: string }> = {
  github_repo: { icon: Github, label: "GitHub Repositories", color: "var(--primary)" },
  jira_project: { icon: Kanban, label: "Jira Projects", color: "var(--secondary)" },
  confluence_space: { icon: BookOpen, label: "Confluence Spaces", color: "var(--tertiary)" },
  linear_team: { icon: ListTree, label: "Linear Teams", color: "var(--secondary)" },
};

function activeSourceTypes(integration: IntegrationSettings | null): DataSourceType[] {
  if (!integration) {
    return ["github_repo", "jira_project", "confluence_space"];
  }
  const t: DataSourceType[] = [];
  if (integration.code === "github") t.push("github_repo");
  if (integration.work === "jira") t.push("jira_project");
  if (integration.work === "linear") t.push("linear_team");
  if (integration.docs === "confluence") t.push("confluence_space");
  return t;
}

export default function SourcesPage() {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [integration, setIntegration] = useState<IntegrationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [formMode, setFormMode] = useState<SourceFormMode | null>(null);

  const fetchSources = useCallback(async () => {
    try {
      const [data, integ] = await Promise.all([
        invoke<DataSource[]>("sources:list"),
        invoke<IntegrationSettings>("integrations:get"),
      ]);
      if (Array.isArray(data)) setSources(data);
      setIntegration(integ);
    } catch (err) {
      console.error("Failed to fetch sources:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const types = activeSourceTypes(integration);
  const grouped: Partial<Record<DataSourceType, DataSource[]>> = {};
  for (const type of types) {
    grouped[type] = sources.filter((s) => s.type === type);
  }

  async function handleDelete(id: string) {
    try {
      await invoke("sources:delete", { id });
      fetchSources();
    } catch (err) {
      console.error("Failed to delete source:", err);
    }
  }

  return (
    <div className="p-6">
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 size={20} className="text-[var(--primary)] animate-spin" />
        </div>
      ) : (
        <div className="max-w-2xl flex flex-col gap-5">
            {(types.map((type) => {
              const items = grouped[type] ?? [];
              const meta = TYPE_META[type];
              const Icon = meta.icon;
              return (
                <Card key={type}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Icon size={16} style={{ color: meta.color }} />
                      <h3 className="text-sm font-semibold text-[var(--on-surface)]">
                        {meta.label}
                      </h3>
                    </div>
                    <Badge variant="neutral">{items.length}</Badge>
                  </div>

                  {items.length === 0 ? (
                    <p className="text-xs text-[var(--on-surface-variant)] mb-4">
                      No {meta.label.toLowerCase()} configured yet.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-1 mb-4">
                      {items.map((source) => (
                        <SourceRow
                          key={source.id}
                          source={source}
                          onEdit={() => setFormMode({ kind: "edit", source })}
                          onDelete={() => handleDelete(source.id)}
                        />
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => setFormMode({ kind: "add", type })}
                    className="flex items-center gap-2 text-xs font-label font-semibold text-[var(--primary)] uppercase tracking-wider hover:opacity-80 transition-opacity"
                  >
                    <Plus size={14} />
                    Add{" "}
                    {type === "github_repo"
                      ? "Repository"
                      : type === "jira_project"
                        ? "Project"
                        : type === "linear_team"
                          ? "Team"
                          : "Space"}
                  </button>
                </Card>
              );
            }))}
        </div>
      )}

      {formMode && (
        <SourceFormDialog
          mode={formMode}
          onClose={() => setFormMode(null)}
          onSaved={() => { setFormMode(null); fetchSources(); }}
        />
      )}
    </div>
  );
}

function SourceRow({
  source,
  onEdit,
  onDelete,
}: {
  source: DataSource;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const boards = (source.metadata?.boards ?? []) as JiraBoardRef[];
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-[var(--surface-container-high)] transition-colors group">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-[var(--on-surface)] truncate">{source.name}</div>
        <div className="text-xs text-[var(--on-surface-variant)] truncate">
          {source.type === "github_repo" && (
            <span>{source.org}/{source.identifier}</span>
          )}
          {source.type === "jira_project" && (
            <span>
              {source.identifier}
              {boards.length > 0 && (
                <> &middot; {boards.length} board{boards.length !== 1 ? "s" : ""}</>
              )}
            </span>
          )}
          {source.type === "confluence_space" && (
            <span>{source.identifier}</span>
          )}
          {source.type === "linear_team" && (
            <span className="font-mono text-[11px]">{source.identifier}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="p-1.5 rounded hover:bg-[var(--surface-container-highest)] text-[var(--on-surface-variant)]"
          title="Edit"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded hover:bg-[var(--error)]/10 text-[var(--error)]"
          title="Remove"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}
