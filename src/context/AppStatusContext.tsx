"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { invoke, setSyncInvalidationSubscriber } from "@/lib/api";
import type {
  AppNotification,
  AppNotificationType,
  SyncProgressPayload,
  SyncStatusResponse,
} from "@/lib/types";

// ---- Channel → category mapping ----

/** Maps an IPC channel to the sync categories it depends on. */
const CHANNEL_CATEGORIES: Record<string, string[]> = {
  "stats:code": ["code"],
  "stats:work": ["work"],
  "stats:velocity": ["code", "work"],
  "stats:docs": ["docs"],
  "stats:review-comments": ["code"],
  "reviews:get": ["code"],
  "notifications:list": ["code", "work", "docs"],
  "reminders:list": ["code", "work", "docs"],
};

export type SyncInvalidationCallback = () => void;

// ---- Progress parsing ----

function parseProgress(raw: unknown): SyncProgressPayload | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.syncing !== "boolean" || typeof o.scope !== "string") return null;
  const labels = o.activeLabels;
  const rawCats = o.completedCategories;
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
    completedCategories: Array.isArray(rawCats)
      ? rawCats.filter((x): x is string => typeof x === "string")
      : undefined,
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
  /** Register an IPC channel to be soft-refreshed when its data category completes syncing. Returns unsubscribe fn. */
  subscribeSyncInvalidation: (channel: string, callback: SyncInvalidationCallback) => () => void;
}

const AppStatusContext = createContext<AppStatusContextValue | null>(null);

export function AppStatusProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<SyncProgressPayload>(defaultProgress);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // ---- Sync invalidation subscriptions ----
  // Map of IPC channel → Set of callbacks to fire on sync completion.
  const subsRef = useRef(new Map<string, Set<SyncInvalidationCallback>>());
  /** Debounce timer so rapid sync completions don't fire callbacks multiple times. */
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const subscribeSyncInvalidation = useCallback(
    (channel: string, callback: SyncInvalidationCallback): (() => void) => {
      const subs = subsRef.current;
      if (!subs.has(channel)) subs.set(channel, new Set());
      subs.get(channel)!.add(callback);
      return () => {
        subs.get(channel)?.delete(callback);
        if (subs.get(channel)?.size === 0) subs.delete(channel);
      };
    },
    [],
  );

  /** Notify subscribed hooks whose channel depends on any of the given categories. */
  const notifySubscribers = useCallback((completedCategories: string[]) => {
    const catSet = new Set(completedCategories);
    const subs = subsRef.current;
    for (const [channel, callbacks] of subs) {
      const deps = CHANNEL_CATEGORIES[channel];
      // If no mapping exists, refresh on any sync completion (conservative)
      const shouldRefresh = !deps || deps.some((c) => catSet.has(c));
      if (shouldRefresh) {
        for (const cb of callbacks) cb();
      }
    }
  }, []);

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

  // Wire the global sync-invalidation subscriber so useIpc hooks auto-refresh after sync.
  useEffect(() => {
    setSyncInvalidationSubscriber(subscribeSyncInvalidation);
    return () => setSyncInvalidationSubscriber(null);
  }, [subscribeSyncInvalidation]);

  useEffect(() => {
    const off = window.electron.onSyncProgress((raw) => {
      const p = parseProgress(raw);
      if (p) {
        setProgress(p);
        // When sync transitions to idle with completedCategories, notify subscribers (debounced)
        if (!p.syncing && p.completedCategories && p.completedCategories.length > 0) {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          const cats = p.completedCategories;
          debounceRef.current = setTimeout(() => {
            notifySubscribers(cats);
            debounceRef.current = null;
          }, 500);
        }
      }
    });
    return off;
  }, [notifySubscribers]);

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
      subscribeSyncInvalidation,
    }),
    [syncing, progress, lastSyncedAt, online, notifications, pushNotification, dismissNotification, fetchSyncStatus, subscribeSyncInvalidation],
  );

  return <AppStatusContext.Provider value={value}>{children}</AppStatusContext.Provider>;
}

export function useAppStatus(): AppStatusContextValue {
  const ctx = useContext(AppStatusContext);
  if (!ctx) throw new Error("useAppStatus must be used within AppStatusProvider");
  return ctx;
}
