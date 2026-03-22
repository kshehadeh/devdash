"use client";

import { X } from "lucide-react";
import { clsx } from "clsx";
import { useAppStatus } from "@/context/AppStatusContext";
import type { AppNotificationType, SyncProgressPayload } from "@/lib/types";

function formatSyncTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function syncMessage(progress: SyncProgressPayload): string {
  if (progress.phase === "prune") {
    return progress.activeLabels[0] ?? "Finishing up…";
  }
  if (progress.scope === "full" && progress.developerTotal && progress.developerTotal > 1) {
    const who = progress.developerName ? progress.developerName : "developer";
    return `Syncing ${who} (${progress.developerIndex ?? 1}/${progress.developerTotal})`;
  }
  if (progress.developerName) {
    return `Syncing ${progress.developerName}`;
  }
  return "Syncing data…";
}

function activeDetail(progress: SyncProgressPayload): string | null {
  if (progress.phase === "prune") return null;
  if (progress.activeLabels.length === 0) return null;
  return progress.activeLabels.join(" · ");
}

function progressFraction(progress: SyncProgressPayload): number | null {
  if (progress.phase === "prune") return null;
  const { totalSteps, completedSteps } = progress;
  if (totalSteps <= 0) return null;
  return Math.min(1, completedSteps / totalSteps);
}

const notifyStyles: Record<AppNotificationType, string> = {
  info: "bg-[var(--surface-container-high)] text-[var(--on-surface-variant)] border-[var(--outline-variant)]/40",
  success: "bg-emerald-950/50 text-emerald-200 border-emerald-700/40",
  warning: "bg-amber-950/40 text-amber-200 border-amber-700/40",
  error: "bg-red-950/40 text-red-200 border-red-700/40",
};

export function StatusBar() {
  const { syncing, progress, lastSyncedAt, notifications, dismissNotification } = useAppStatus();
  const pct = progressFraction(progress);
  const detail = activeDetail(progress);

  return (
    <div
      className={clsx(
        "fixed bottom-0 left-16 right-0 z-40 border-t border-[var(--outline-variant)]/35 bg-[var(--surface-container-low)]/95 backdrop-blur-sm shadow-[0_-4px_24px_rgba(0,0,0,0.25)]",
        syncing ? "pb-2 pt-1.5" : "py-1.5",
      )}
    >
      <div className="flex items-center gap-3 px-4 min-h-8">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span
            className={clsx(
              "inline-block w-1.5 h-1.5 rounded-full shrink-0",
              syncing ? "bg-amber-400 animate-pulse" : lastSyncedAt ? "bg-emerald-400" : "bg-[var(--outline)]",
            )}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-label text-[var(--on-surface-variant)] leading-tight truncate">
              {syncing ? (
                <>
                  <span className="text-[var(--on-surface)] font-medium">{syncMessage(progress)}</span>
                  {detail && (
                    <>
                      <span className="text-[var(--on-surface-variant)]/70"> — </span>
                      <span className="text-[var(--on-surface-variant)]">{detail}</span>
                    </>
                  )}
                  {pct !== null && progress.totalSteps > 0 && (
                    <span className="text-[var(--on-surface-variant)]/80 ml-1.5 tabular-nums">
                      ({progress.completedSteps}/{progress.totalSteps})
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="text-[var(--on-surface)] font-medium">Ready</span>
                  <span className="text-[var(--on-surface-variant)]/70"> · </span>
                  <span>
                    {lastSyncedAt ? `Last synced ${formatSyncTime(lastSyncedAt)}` : "Not synced yet"}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        {notifications.length > 0 && (
          <div className="flex items-center gap-1.5 shrink-0 max-w-[min(420px,45vw)] overflow-x-auto overflow-y-hidden py-0.5">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={clsx(
                  "flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md border text-[10px] font-label leading-tight shrink-0 max-w-[220px]",
                  notifyStyles[n.type],
                )}
              >
                <span className="truncate">{n.message}</span>
                <button
                  type="button"
                  onClick={() => dismissNotification(n.id)}
                  className="p-0.5 rounded hover:bg-white/10 text-[var(--on-surface-variant)] shrink-0"
                  aria-label="Dismiss notification"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {syncing && (
        <div className="px-4 pb-0.5">
          <div className="h-1 rounded-full bg-[var(--surface-container-highest)] overflow-hidden">
            {pct === null ? (
              <div className="h-full w-full rounded-full bg-[var(--primary)]/35 animate-pulse" />
            ) : (
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--primary-container)] transition-[width] duration-300"
                style={{ width: `${Math.round(pct * 100)}%` }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
