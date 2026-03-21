"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Github,
  Kanban,
  BookOpen,
  Plus,
  Trash2,
  Pencil,
  Loader2,
} from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Dialog } from "../../components/ui/Dialog";
import { Combobox } from "../../components/ui/Combobox";
import type { ComboboxOption } from "../../components/ui/Combobox";
import type { DataSource, DataSourceType, JiraBoardRef } from "../../../lib/types";

type FormMode = { kind: "add"; type: DataSourceType } | { kind: "edit"; source: DataSource };

const TYPE_META: Record<DataSourceType, { icon: typeof Github; label: string; color: string }> = {
  github_repo: { icon: Github, label: "GitHub Repositories", color: "var(--primary)" },
  jira_project: { icon: Kanban, label: "Jira Projects", color: "var(--secondary)" },
  confluence_space: { icon: BookOpen, label: "Confluence Spaces", color: "var(--tertiary)" },
};

export default function SourcesPage() {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [formMode, setFormMode] = useState<FormMode | null>(null);

  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch("/api/sources");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setSources(data);
    } catch (err) {
      console.error("Failed to fetch sources:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const grouped: Record<DataSourceType, DataSource[]> = {
    github_repo: sources.filter((s) => s.type === "github_repo"),
    jira_project: sources.filter((s) => s.type === "jira_project"),
    confluence_space: sources.filter((s) => s.type === "confluence_space"),
  };

  async function handleDelete(id: string) {
    const res = await fetch(`/api/sources/${id}`, { method: "DELETE" });
    if (res.ok) fetchSources();
  }

  return (
    <div className="p-6">
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 size={20} className="text-[var(--primary)] animate-spin" />
        </div>
      ) : (
        <div className="max-w-2xl flex flex-col gap-5">
            {(Object.entries(grouped) as [DataSourceType, DataSource[]][]).map(([type, items]) => {
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
                    Add {type === "github_repo" ? "Repository" : type === "jira_project" ? "Project" : "Space"}
                  </button>
                </Card>
              );
            })}
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

function SourceFormDialog({
  mode,
  onClose,
  onSaved,
}: {
  mode: FormMode;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = mode.kind === "edit";
  const sourceType = isEdit ? mode.source.type : mode.type;
  const existing = isEdit ? mode.source : null;

  const [name, setName] = useState(existing?.name ?? "");
  const [org, setOrg] = useState(existing?.org ?? "");
  const [identifier, setIdentifier] = useState(existing?.identifier ?? "");
  const [boards, setBoards] = useState<JiraBoardRef[]>(
    (existing?.metadata?.boards as JiraBoardRef[] | undefined) ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Discovery state
  const [ghOrgs, setGhOrgs] = useState<ComboboxOption[]>([]);
  const [ghRepos, setGhRepos] = useState<ComboboxOption[]>([]);
  const [ghOrgsLoading, setGhOrgsLoading] = useState(false);
  const [ghReposLoading, setGhReposLoading] = useState(false);

  const [jiraProjects, setJiraProjects] = useState<ComboboxOption[]>([]);
  const [jiraProjectsLoading, setJiraProjectsLoading] = useState(false);
  const [availableBoards, setAvailableBoards] = useState<{ id: number; name: string; type: string }[]>([]);
  const [boardsLoading, setBoardsLoading] = useState(false);

  const [confluenceSpaces, setConfluenceSpaces] = useState<ComboboxOption[]>([]);
  const [confluenceLoading, setConfluenceLoading] = useState(false);
  const [confluenceSearching, setConfluenceSearching] = useState(false);

  const title = isEdit
    ? `Edit ${sourceType === "github_repo" ? "Repository" : sourceType === "jira_project" ? "Project" : "Space"}`
    : `Add ${sourceType === "github_repo" ? "Repository" : sourceType === "jira_project" ? "Project" : "Space"}`;

  // Fetch GitHub orgs on mount
  useEffect(() => {
    if (sourceType !== "github_repo") return;
    setGhOrgsLoading(true);
    fetch("/api/discover/github/orgs")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { login: string }[]) => {
        setGhOrgs(data.map((o) => ({ value: o.login, label: o.login })));
      })
      .catch(() => {})
      .finally(() => setGhOrgsLoading(false));
  }, [sourceType]);

  // Fetch repos when org changes
  useEffect(() => {
    if (sourceType !== "github_repo" || !org) {
      setGhRepos([]);
      return;
    }
    setGhReposLoading(true);
    fetch(`/api/discover/github/repos?org=${encodeURIComponent(org)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { name: string; description: string | null; language: string | null; isPrivate: boolean }[]) => {
        setGhRepos(
          data.map((r) => ({
            value: r.name,
            label: r.name,
            description: [r.language, r.isPrivate ? "Private" : "Public", r.description].filter(Boolean).join(" · "),
          })),
        );
      })
      .catch(() => {})
      .finally(() => setGhReposLoading(false));
  }, [sourceType, org]);

  // Fetch Jira projects on mount
  useEffect(() => {
    if (sourceType !== "jira_project") return;
    setJiraProjectsLoading(true);
    fetch("/api/discover/jira/projects")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { key: string; name: string; type: string }[]) => {
        setJiraProjects(data.map((p) => ({ value: p.key, label: `${p.key} — ${p.name}`, description: p.type })));
      })
      .catch(() => {})
      .finally(() => setJiraProjectsLoading(false));
  }, [sourceType]);

  // Fetch boards when Jira project changes
  useEffect(() => {
    if (sourceType !== "jira_project" || !identifier) {
      setAvailableBoards([]);
      return;
    }
    setBoardsLoading(true);
    fetch(`/api/discover/jira/boards?projectKey=${encodeURIComponent(identifier)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { id: number; name: string; type: string }[]) => {
        setAvailableBoards(data);
      })
      .catch(() => {})
      .finally(() => setBoardsLoading(false));
  }, [sourceType, identifier]);

  // Fetch initial Confluence spaces on mount (small batch)
  useEffect(() => {
    if (sourceType !== "confluence_space") return;
    setConfluenceLoading(true);
    fetch("/api/discover/confluence/spaces")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { key: string; name: string }[]) => {
        setConfluenceSpaces(data.map((s) => ({ value: s.key, label: s.name, description: s.key })));
      })
      .catch(() => {})
      .finally(() => setConfluenceLoading(false));
  }, [sourceType]);

  // Server-side Confluence space search
  function handleConfluenceSearch(query: string) {
    if (!query) {
      // Reset to initial batch
      setConfluenceSearching(true);
      fetch("/api/discover/confluence/spaces")
        .then((r) => (r.ok ? r.json() : []))
        .then((data: { key: string; name: string }[]) => {
          setConfluenceSpaces(data.map((s) => ({ value: s.key, label: s.name, description: s.key })));
        })
        .catch(() => {})
        .finally(() => setConfluenceSearching(false));
      return;
    }
    setConfluenceSearching(true);
    fetch(`/api/discover/confluence/spaces?q=${encodeURIComponent(query)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { key: string; name: string }[]) => {
        setConfluenceSpaces(data.map((s) => ({ value: s.key, label: s.name, description: s.key })));
      })
      .catch(() => {})
      .finally(() => setConfluenceSearching(false));
  }

  // Auto-fill name when selecting from dropdowns
  function handleRepoSelect(repoName: string) {
    setIdentifier(repoName);
    if (!name) setName(repoName);
  }

  function handleOrgSelect(orgLogin: string) {
    setOrg(orgLogin);
    setIdentifier("");
    setGhRepos([]);
  }

  function handleProjectSelect(projectKey: string) {
    setIdentifier(projectKey);
    const proj = jiraProjects.find((p) => p.value === projectKey);
    if (proj && !name) {
      setName(proj.label.split(" — ")[1] ?? projectKey);
    }
    setBoards([]);
  }

  function handleSpaceSelect(spaceKey: string) {
    setIdentifier(spaceKey);
    const space = confluenceSpaces.find((s) => s.value === spaceKey);
    if (space && !name) setName(space.label);
  }

  function toggleBoard(board: { id: number; name: string }) {
    setBoards((prev) => {
      const exists = prev.some((b) => b.id === board.id);
      if (exists) return prev.filter((b) => b.id !== board.id);
      return [...prev, { id: board.id, name: board.name }];
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const payload: Record<string, unknown> = {
      name: name.trim(),
      org: org.trim(),
      identifier: identifier.trim(),
    };
    if (sourceType === "jira_project") {
      payload.metadata = { boards };
    }
    if (!isEdit) {
      payload.type = sourceType;
    }

    try {
      const url = isEdit ? `/api/sources/${existing!.id}` : "/api/sources";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to save");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">

        {/* ---- GitHub Repo ---- */}
        {sourceType === "github_repo" && (
          <>
            <Combobox
              label="Organization / Owner"
              options={ghOrgs}
              value={org}
              onChange={handleOrgSelect}
              placeholder="Select an organization..."
              loading={ghOrgsLoading}
            />
            <Combobox
              label="Repository"
              options={ghRepos}
              value={identifier}
              onChange={handleRepoSelect}
              placeholder={org ? "Select a repository..." : "Select an org first"}
              loading={ghReposLoading}
              disabled={!org}
            />
          </>
        )}

        {/* ---- Jira Project ---- */}
        {sourceType === "jira_project" && (
          <>
            <Combobox
              label="Project"
              options={jiraProjects}
              value={identifier}
              onChange={handleProjectSelect}
              placeholder="Select a Jira project..."
              loading={jiraProjectsLoading}
            />

            {identifier && (
              <div>
                <label className="block text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
                  Boards
                </label>
                {boardsLoading ? (
                  <div className="flex items-center gap-2 py-3 text-xs text-[var(--on-surface-variant)]">
                    <Loader2 size={14} className="animate-spin" />
                    Loading boards...
                  </div>
                ) : availableBoards.length === 0 ? (
                  <p className="text-xs text-[var(--on-surface-variant)] py-2">
                    No boards found for this project.
                  </p>
                ) : (
                  <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                    {availableBoards.map((board) => {
                      const checked = boards.some((b) => b.id === board.id);
                      return (
                        <label
                          key={board.id}
                          className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-[var(--surface-container-high)] transition-colors cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleBoard(board)}
                            className="accent-[var(--primary)] w-3.5 h-3.5"
                          />
                          <Kanban size={13} className="text-[var(--on-surface-variant)] shrink-0" />
                          <span className="text-sm text-[var(--on-surface)] flex-1 truncate">{board.name}</span>
                          <span className="text-[10px] text-[var(--on-surface-variant)] font-label">{board.type}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ---- Confluence Space ---- */}
        {sourceType === "confluence_space" && (
          <Combobox
            label="Space"
            options={confluenceSpaces}
            value={identifier}
            onChange={handleSpaceSelect}
            onSearch={handleConfluenceSearch}
            placeholder="Search for a Confluence space..."
            searchPlaceholder="Type to search spaces..."
            minSearchLength={2}
            loading={confluenceLoading}
            searchLoading={confluenceSearching}
          />
        )}

        {/* Display name (auto-filled but editable) */}
        <div>
          <label className="block text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider mb-1.5">
            Display Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Auto-filled from selection"
            required
            className="w-full bg-[var(--surface-container-lowest)] text-[var(--on-surface)] text-sm rounded-md px-3 py-2.5 outline-none focus:ring-1 focus:ring-[var(--primary)] placeholder:text-[var(--outline)]"
          />
        </div>

        {error && (
          <p className="text-xs text-[var(--error)] bg-[var(--error)]/10 px-3 py-2 rounded-md">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving || !identifier}
            className="px-4 py-2 bg-gradient-to-r from-[var(--primary)] to-[var(--primary-container)] text-[var(--on-primary)] text-sm font-semibold rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Add"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-[var(--surface-container-high)] text-[var(--on-surface)] text-sm font-semibold rounded-md hover:bg-[var(--surface-container-highest)] transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </Dialog>
  );
}
