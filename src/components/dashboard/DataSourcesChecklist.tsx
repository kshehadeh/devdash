import { Github, Kanban, BookOpen, ListTree } from "lucide-react";
import type { DataSource, DataSourceType } from "@/lib/types";

const SOURCE_ICONS: Record<DataSourceType, typeof Github> = {
  github_repo: Github,
  jira_project: Kanban,
  confluence_space: BookOpen,
  linear_team: ListTree,
};

export interface DataSourcesChecklistProps {
  sources: DataSource[];
  selectedIds: Set<string>;
  onToggle: (sourceId: string) => void;
}

export function DataSourcesChecklist({ sources, selectedIds, onToggle }: DataSourcesChecklistProps) {
  return (
    <div className="flex flex-col gap-1">
      {sources.map((source) => {
        const Icon = SOURCE_ICONS[source.type];
        const checked = selectedIds.has(source.id);
        return (
          <label
            key={source.id}
            className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-[var(--surface-container-high)] transition-colors cursor-pointer"
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(source.id)}
              className="accent-[var(--primary)] w-3.5 h-3.5"
            />
            <Icon size={13} className="text-[var(--on-surface-variant)] shrink-0" />
            <span className="text-sm text-[var(--on-surface)] flex-1 truncate">{source.name}</span>
            <span className="text-[10px] text-[var(--on-surface-variant)] font-label">
              {source.type === "github_repo" ? `${source.org}/${source.identifier}` : source.identifier}
            </span>
          </label>
        );
      })}
    </div>
  );
}
