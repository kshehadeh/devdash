"use client";

import { X, AlertCircle, User, GitBranch } from "lucide-react";
import { clsx } from "clsx";
import { FullWindowModal } from "@/components/ui/FullWindowModal";
import { useAppStatus } from "@/context/AppStatusContext";
import type { SyncErrorEntry } from "@/lib/types";

function formatErrorTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function humanizeDataType(dataType: string): string {
  return dataType
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

interface ErrorGroup {
  key: string;
  label: string;
  icon: React.ReactNode;
  errors: SyncErrorEntry[];
}

export function SyncErrorsModal() {
  const { syncErrors, showSyncErrors, setShowSyncErrors, clearSyncErrors } = useAppStatus();

  // Group errors by developer or repo
  const grouped = syncErrors.reduce<{
    developers: Map<string, SyncErrorEntry[]>;
    repos: Map<string, SyncErrorEntry[]>;
  }>(
    (acc, error) => {
      if (error.scope === "developer" && error.developerName) {
        const list = acc.developers.get(error.developerName) ?? [];
        list.push(error);
        acc.developers.set(error.developerName, list);
      } else if (error.scope === "repo" && error.repoName) {
        const list = acc.repos.get(error.repoName) ?? [];
        list.push(error);
        acc.repos.set(error.repoName, list);
      }
      return acc;
    },
    { developers: new Map(), repos: new Map() },
  );

  const developerGroups: ErrorGroup[] = Array.from(grouped.developers.entries()).map(
    ([name, errors]) => ({
      key: `dev-${name}`,
      label: name,
      icon: <User size={14} className="shrink-0" />,
      errors,
    }),
  );

  const repoGroups: ErrorGroup[] = Array.from(grouped.repos.entries()).map(([name, errors]) => ({
    key: `repo-${name}`,
    label: name,
    icon: <GitBranch size={14} className="shrink-0" />,
    errors,
  }));

  const allGroups = [...developerGroups, ...repoGroups];

  return (
    <FullWindowModal
      open={showSyncErrors}
      onClose={() => setShowSyncErrors(false)}
      title="Sync Errors"
      description="The following errors occurred during the last sync."
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Header actions */}
        <div className="shrink-0 border-b border-[var(--outline-variant)]/20 bg-[var(--surface-container-high)] px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="text-[var(--error)]" />
              <span className="text-sm text-[var(--on-surface-variant)]">
                {syncErrors.length} error{syncErrors.length === 1 ? "" : "s"} total
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                clearSyncErrors();
                setShowSyncErrors(false);
              }}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-[var(--on-surface-variant)] hover:bg-[var(--surface-container)] transition-colors"
            >
              <X size={14} />
              Dismiss All
            </button>
          </div>
        </div>

        {/* Error list */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {allGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle size={32} className="text-[var(--on-surface-variant)]/50 mb-3" />
              <p className="text-sm text-[var(--on-surface-variant)]">No sync errors</p>
              <p className="text-xs text-[var(--on-surface-variant)]/70 mt-1">
                Errors from the last sync will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {allGroups.map((group) => (
                <div key={group.key}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex items-center justify-center w-6 h-6 rounded bg-[var(--surface-container-high)] text-[var(--on-surface-variant)]">
                      {group.icon}
                    </div>
                    <h3 className="text-sm font-medium text-[var(--on-surface)]">{group.label}</h3>
                  </div>
                  <div className="ml-8 space-y-2">
                    {group.errors.map((error, idx) => (
                      <div
                        key={`${group.key}-${idx}`}
                        className={clsx(
                          "rounded-lg border bg-[var(--surface-container-low)] px-3 py-2.5",
                          "border-[var(--outline-variant)]/30",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-[var(--on-surface)]">
                              {humanizeDataType(error.dataType)}
                            </p>
                            <p className="text-xs text-[var(--error)] mt-1 break-words">
                              {error.errorMessage}
                            </p>
                            <p className="text-[10px] text-[var(--on-surface-variant)]/70 mt-1">
                              {formatErrorTime(error.lastSyncedAt)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-[var(--outline-variant)]/20 bg-[var(--surface-container-highest)] px-6 py-4">
          <button
            type="button"
            onClick={() => setShowSyncErrors(false)}
            className="px-4 py-2 bg-[var(--surface-container-high)] text-[var(--on-surface)] text-sm font-medium rounded-md hover:bg-[var(--surface-bright)] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </FullWindowModal>
  );
}
