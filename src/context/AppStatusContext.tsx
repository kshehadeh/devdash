"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { invoke } from "@/lib/api";
import type {
  AppNotification,
  AppNotificationType,
  SyncProgressPayload,
  SyncStatusResponse,
} from "@/lib/types";

function parseProgress(raw: unknown): SyncProgressPayload | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.syncing !== "boolean" || typeof o.scope !== "string") return null;
  const labels = o.activeLabels;
  return {
    syncing: o.syncing,
    scope: o.scope as SyncProgressPayload["scope"],
    developerName: typeof o.developerName === "string" ? o.developerName : undefined,
    developerIndex: typeof o.developerIndex === "number" ? o.developerIndex : undefined,
    developerTotal: typeof o.developerTotal === "number" ? o.developerTotal : undefined,
    completedSteps: typeof o.completedSteps === "number" ? o.completedSteps : 0,
    totalSteps: typeof o.totalSteps === "number" ? o.totalSteps : 4,
    activeLabels: Array.isArray(labels) ? labels.filter((x): x is string => typeof x === "string") : [],
    phase: o.phase === "prune" ? "prune" : "sync",
  };
}

const defaultProgress: SyncProgressPayload = {
  syncing: false,
  scope: "idle",
  completedSteps: 0,
  totalSteps: 4,
  activeLabels: [],
  phase: "sync",
};

interface AppStatusContextValue {
  syncing: boolean;
  progress: SyncProgressPayload;
  lastSyncedAt: string | null;
  online: boolean;
  notifications: AppNotification[];
  pushNotification: (n: { message: string; type?: AppNotificationType; ttlMs?: number }) => void;
  dismissNotification: (id: string) => void;
  refreshSyncStatus: () => Promise<void>;
}

const AppStatusContext = createContext<AppStatusContextValue | null>(null);

export function AppStatusProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<SyncProgressPayload>(defaultProgress);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const fetchSyncStatus = useCallback(async () => {
    try {
      const data = await invoke<SyncStatusResponse>("sync:status");
      const sel = localStorage.getItem("devdash.selectedDevId") ?? "";
      const dev = data.developers?.find((d) => d.id === sel);
      setLastSyncedAt(dev?.lastSyncedAt ?? null);
      setOnline(data.online);
      if (data.progress) {
        const p = parseProgress(data.progress);
        if (p) setProgress(p);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void fetchSyncStatus();
    const id = setInterval(() => void fetchSyncStatus(), 5000);
    return () => clearInterval(id);
  }, [fetchSyncStatus]);

  useEffect(() => {
    const off = window.electron.onSyncProgress((raw) => {
      const p = parseProgress(raw);
      if (p) setProgress(p);
    });
    return off;
  }, []);

  useEffect(() => {
    const off = window.electron.onNetworkStatus(({ online: next }) => {
      setOnline(next);
    });
    return off;
  }, []);

  const pushNotification = useCallback(
    (n: { message: string; type?: AppNotificationType; ttlMs?: number }) => {
      const id = crypto.randomUUID();
      const type: AppNotificationType = n.type ?? "info";
      setNotifications((prev) => [...prev, { id, message: n.message, type, createdAt: Date.now() }]);
      if (n.ttlMs && n.ttlMs > 0) {
        setTimeout(() => {
          setNotifications((prev) => prev.filter((x) => x.id !== id));
        }, n.ttlMs);
      }
    },
    [],
  );

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const syncing = progress.syncing;

  const value = useMemo(
    () => ({
      syncing,
      progress,
      lastSyncedAt,
      online,
      notifications,
      pushNotification,
      dismissNotification,
      refreshSyncStatus: fetchSyncStatus,
    }),
    [syncing, progress, lastSyncedAt, online, notifications, pushNotification, dismissNotification, fetchSyncStatus],
  );

  return <AppStatusContext.Provider value={value}>{children}</AppStatusContext.Provider>;
}

export function useAppStatus(): AppStatusContextValue {
  const ctx = useContext(AppStatusContext);
  if (!ctx) throw new Error("useAppStatus must be used within AppStatusProvider");
  return ctx;
}
