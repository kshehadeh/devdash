import { useState, useEffect } from "react";
import { Kanban, Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Combobox } from "@/components/ui/Combobox";
import type { ComboboxOption } from "@/components/ui/Combobox";
import type { DataSource, DataSourceType, JiraBoardRef } from "@/lib/types";
import { invoke } from "@/lib/api";

export type SourceFormMode =
  | { kind: "add"; type: DataSourceType }
  | { kind: "edit"; source: DataSource };

export function SourceFormDialog({
  mode,
  onClose,
  onSaved,
}: {
  mode: SourceFormMode;
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

  const [ghOrgs, setGhOrgs] = useState<ComboboxOption[]>([]);
  const [ghRepos, setGhRepos] = useState<ComboboxOption[]>([]);
  const [ghOrgsLoading, setGhOrgsLoading] = useState(false);
  const [ghReposLoading, setGhReposLoading] = useState(false);

  const [jiraProjects, setJiraProjects] = useState<ComboboxOption[]>([]);
  const [jiraProjectsLoading, setJiraProjectsLoading] = useState(false);
  const [availableBoards, setAvailableBoards] = useState<{ id: number; name: string; type: string }[]>([]);
  const [boardsLoading, setBoardsLoading] = useState(false);

  const [confluenceSpaces, setConfluenceSpaces] = useState<ComboboxOption[]>([]);
  const [confluenceSearching, setConfluenceSearching] = useState(false);
  const [confluenceSearchMatchKeys, setConfluenceSearchMatchKeys] = useState<Set<string>>(() => new Set());

  const [linearTeams, setLinearTeams] = useState<ComboboxOption[]>([]);
  const [linearTeamsLoading, setLinearTeamsLoading] = useState(false);

  const title = isEdit
    ? `Edit ${
        sourceType === "github_repo"
          ? "Repository"
          : sourceType === "jira_project"
            ? "Project"
            : sourceType === "linear_team"
              ? "Linear Team"
              : "Space"
      }`
    : `Add ${
        sourceType === "github_repo"
          ? "Repository"
          : sourceType === "jira_project"
            ? "Project"
            : sourceType === "linear_team"
              ? "Linear Team"
              : "Space"
      }`;

  useEffect(() => {
    if (sourceType !== "github_repo") return;
    setGhOrgsLoading(true);
    invoke<{ login: string }[]>("discover:github:orgs")
      .then((data) => {
        setGhOrgs(data.map((o) => ({ value: o.login, label: o.login })));
      })
      .catch(() => {})
      .finally(() => setGhOrgsLoading(false));
  }, [sourceType]);

  useEffect(() => {
    if (sourceType !== "github_repo" || !org) {
      setGhRepos([]);
      return;
    }
    setGhReposLoading(true);
    invoke<{ name: string; description: string | null; language: string | null; isPrivate: boolean }[]>("discover:github:repos", { org })
      .then((data) => {
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

  useEffect(() => {
    if (sourceType !== "jira_project") return;
    setJiraProjectsLoading(true);
    invoke<{ key: string; name: string; type: string }[]>("discover:jira:projects")
      .then((data) => {
        setJiraProjects(data.map((p) => ({ value: p.key, label: `${p.key} — ${p.name}`, description: p.type })));
      })
      .catch(() => {})
      .finally(() => setJiraProjectsLoading(false));
  }, [sourceType]);

  useEffect(() => {
    if (sourceType !== "jira_project" || !identifier) {
      setAvailableBoards([]);
      return;
    }
    setBoardsLoading(true);
    invoke<{ id: number; name: string; type: string }[]>("discover:jira:boards", { projectKey: identifier })
      .then((data) => {
        setAvailableBoards(data);
      })
      .catch(() => {})
      .finally(() => setBoardsLoading(false));
  }, [sourceType, identifier]);

  useEffect(() => {
    if (sourceType !== "linear_team") return;
    setLinearTeamsLoading(true);
    invoke<{ id: string; key: string; name: string }[]>("discover:linear:teams")
      .then((data) => {
        setLinearTeams(
          data.map((t) => ({
            value: t.id,
            label: `${t.name} (${t.key})`,
            description: t.key,
          })),
        );
      })
      .catch(() => {})
      .finally(() => setLinearTeamsLoading(false));
  }, [sourceType]);

  useEffect(() => {
    if (sourceType !== "confluence_space") return;
    setConfluenceSearchMatchKeys(new Set());
    if (isEdit && existing?.identifier) {
      setConfluenceSpaces([
        {
          value: existing.identifier,
          label: existing.name?.trim() || existing.identifier,
          description: existing.identifier,
        },
      ]);
    } else {
      setConfluenceSpaces([]);
    }
  }, [sourceType, isEdit, existing?.id, existing?.identifier, existing?.name]);

  function handleConfluenceSearch(query: string) {
    if (!query) {
      setConfluenceSearchMatchKeys(new Set());
      setConfluenceSearching(false);
      return;
    }
    setConfluenceSearching(true);
    invoke<{ key: string; name: string }[]>("discover:confluence:spaces", { q: query })
      .then((data) => {
        setConfluenceSearchMatchKeys(new Set(data.map((s) => s.key)));
        const additions = data.map((s) => ({ value: s.key, label: s.name, description: s.key }));
        setConfluenceSpaces((prev) => {
          const seen = new Set(prev.map((o) => o.value));
          const merged = [...prev];
          for (const o of additions) {
            if (!seen.has(o.value)) {
              seen.add(o.value);
              merged.push(o);
            }
          }
          return merged;
        });
      })
      .catch(() => {})
      .finally(() => setConfluenceSearching(false));
  }

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

  function handleLinearTeamSelect(teamId: string) {
    setIdentifier(teamId);
    const team = linearTeams.find((t) => t.value === teamId);
    if (team && !name) {
      const base = team.label.split(" (")[0]?.trim();
      if (base) setName(base);
    }
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
      if (isEdit) {
        await invoke("sources:upsert", { id: existing!.id, ...payload });
      } else {
        await invoke("sources:create", payload);
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

        {sourceType === "linear_team" && (
          <Combobox
            label="Team"
            options={linearTeams}
            value={identifier}
            onChange={handleLinearTeamSelect}
            placeholder="Select a Linear team..."
            loading={linearTeamsLoading}
          />
        )}

        {sourceType === "confluence_space" && (
          <Combobox
            label="Space"
            options={confluenceSpaces}
            value={identifier}
            onChange={handleSpaceSelect}
            onSearch={handleConfluenceSearch}
            onSearchInput={() => setConfluenceSearchMatchKeys(new Set())}
            searchMatchKeys={confluenceSearchMatchKeys}
            placeholder="Search for a Confluence space..."
            searchPlaceholder="Type to search spaces..."
            emptyBrowseHint="Type to search Confluence. Spaces you load stay in this list until you close the dialog."
            minSearchLength={1}
            searchLoading={confluenceSearching}
          />
        )}

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
