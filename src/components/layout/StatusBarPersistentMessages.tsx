"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { clsx } from "clsx";
import { invoke } from "@/lib/api";
import { useSelectedDeveloper } from "@/context/SelectedDeveloperContext";
import { DEVELOPER_SOURCES_CHANGED_EVENT } from "@/lib/app-events";
import type { DataSource } from "@/lib/types";

export function StatusBarPersistentMessages() {
  const { selectedDevId } = useSelectedDeveloper();
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

  if (!noSourcesWarning) return null;

  return (
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
  );
}
