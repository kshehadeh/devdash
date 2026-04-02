"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, AlertCircle, Download } from "lucide-react";
import { clsx } from "clsx";
import { invoke } from "@/lib/api";
import { useSelectedDeveloper } from "@/context/SelectedDeveloperContext";
import { useUpdate } from "@/context/UpdateContext";
import { useAppStatus } from "@/context/AppStatusContext";
import { DEVELOPER_SOURCES_CHANGED_EVENT } from "@/lib/app-events";
import type { DataSource } from "@/lib/types";

export function StatusBarPersistentMessages() {
  const { selectedDevId } = useSelectedDeveloper();
  const { pendingUpdate, autoUpdateChecksEnabled, openUpdateModal } = useUpdate();
  const { syncErrorCount, setShowSyncErrors } = useAppStatus();
  const [noSourcesWarning, setNoSourcesWarning] = useState(false);

  const refreshSourcesWarning = useCallback(async () => {
    if (!selectedDevId) {
      setNoSourcesWarning(false);
      return;
    }
    try {
      const sources = await invoke<DataSource[]>("developers:sources:get", { id: selectedDevId });
      setNoSourcesWarning(Array.isArray(sources) && sources.length === 0);
    } catch {
      setNoSourcesWarning(false);
    }
  }, [selectedDevId]);

  useEffect(() => {
    void refreshSourcesWarning();
  }, [refreshSourcesWarning]);

  useEffect(() => {
    const onSourcesChanged = () => void refreshSourcesWarning();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshSourcesWarning();
    };
    window.addEventListener(DEVELOPER_SOURCES_CHANGED_EVENT, onSourcesChanged);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(DEVELOPER_SOURCES_CHANGED_EVENT, onSourcesChanged);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshSourcesWarning]);

  const showUpdateChip = Boolean(pendingUpdate && autoUpdateChecksEnabled);
  const showSyncErrorsChip = syncErrorCount > 0;
  if (!showUpdateChip && !noSourcesWarning && !showSyncErrorsChip) return null;

  return (
    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end max-w-[min(420px,48vw)]">
      {showUpdateChip && pendingUpdate && (
        <button
          type="button"
          onClick={openUpdateModal}
          className={clsx(
            "flex items-center gap-1.5 shrink-0 max-w-[min(300px,42vw)] pl-2 pr-2.5 py-1 rounded-md border text-left",
            "bg-[color-mix(in_srgb,var(--primary-container)_35%,var(--surface-container-low))]",
            "border-[color-mix(in_srgb,var(--primary)_40%,var(--outline-variant))]",
            "text-[var(--primary)] hover:opacity-90 transition-opacity cursor-pointer",
          )}
          role="status"
          aria-live="polite"
        >
          <Download className="shrink-0" size={14} strokeWidth={2.25} aria-hidden />
          <span className="text-[10px] font-label leading-tight min-w-0">
            <span className="font-semibold text-[var(--on-surface)]">Update available</span>
            <span className="text-[var(--on-surface-variant)]">
              {" "}
              v{pendingUpdate.version} — click to install
            </span>
          </span>
        </button>
      )}
      {noSourcesWarning && (
        <div
          className={clsx(
            "flex items-center gap-1.5 shrink-0 max-w-[min(380px,42vw)] pl-2 pr-2.5 py-1 rounded-md border",
            "bg-[color-mix(in_srgb,var(--tertiary-container)_30%,var(--surface-container-low))]",
            "border-[color-mix(in_srgb,var(--tertiary-container)_45%,var(--outline-variant))]",
            "text-[var(--tertiary)]",
          )}
          role="status"
          aria-live="polite"
        >
          <AlertTriangle className="shrink-0" size={14} strokeWidth={2.25} aria-hidden />
          <p className="text-[10px] font-label leading-tight">
            <span className="font-semibold text-[var(--on-surface)]">No data sources</span>
            <span className="text-[var(--on-surface-variant)]"> — assign repos or projects in </span>
            <span className="text-[var(--on-surface)]">Developer → Edit</span>
            <span className="text-[var(--on-surface-variant)]">.</span>
          </p>
        </div>
      )}
      {showSyncErrorsChip && (
        <button
          type="button"
          onClick={() => setShowSyncErrors(true)}
          className={clsx(
            "flex items-center gap-1.5 shrink-0 max-w-[min(300px,42vw)] pl-2 pr-2.5 py-1 rounded-md border text-left",
            "bg-[color-mix(in_srgb,var(--error-container)_35%,var(--surface-container-low))]",
            "border-[color-mix(in_srgb,var(--error)_40%,var(--outline-variant))]",
            "text-[var(--error)] hover:opacity-90 transition-opacity cursor-pointer",
          )}
          role="status"
          aria-live="polite"
        >
          <AlertCircle className="shrink-0" size={14} strokeWidth={2.25} aria-hidden />
          <span className="text-[10px] font-label leading-tight min-w-0">
            <span className="font-semibold text-[var(--on-surface)]">
              {syncErrorCount} sync error{syncErrorCount === 1 ? "" : "s"}
            </span>
            <span className="text-[var(--on-surface-variant)]"> — click for details</span>
          </span>
        </button>
      )}
    </div>
  );
}
