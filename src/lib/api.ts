import { useState, useEffect, useCallback, useRef } from "react";

export interface ContextMenuContext {
  title: string;
  url: string | null;
  itemType: "pr" | "ticket" | "doc";
  /** When set (e.g. from the notifications UI), the reminder is tied to this notification row. */
  notificationId?: string | null;
}

export interface ContextMenuAction {
  action: string;
  context: ContextMenuContext;
  remindAt?: string;
}

export type ConsoleLogLevel = "log" | "warn" | "error";
export type ConsoleLogSource = "main" | "renderer";

export interface ConsoleLogEntry {
  id: string;
  timestamp: string;
  level: ConsoleLogLevel;
  source: ConsoleLogSource;
  message: string;
}

declare global {
  interface Window {
    electron: {
      platform: string;
      invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>;
      onMenuNavigate: (callback: (path: string) => void) => void;
      onOpenCommandPalette: (callback: () => void) => () => void;
      onSyncProgress: (callback: (payload: unknown) => void) => () => void;
      onNetworkStatus: (callback: (payload: { online: boolean }) => void) => () => void;
      onUpdateAvailable: (callback: (payload: { version: string }) => void) => () => void;
      onNotificationOpen: (callback: (payload: { id: string }) => void) => () => void;
      onNotificationsChanged: (callback: () => void) => () => void;
      onRemindersChanged: (callback: () => void) => () => void;
      onReminderNavigate: (callback: (payload: { id: string }) => void) => () => void;
      onContextMenuAction: (callback: (payload: ContextMenuAction) => void) => () => void;
      onConsoleLog: (callback: (payload: ConsoleLogEntry) => void) => () => void;
      sendConsoleLog: (payload: { level: ConsoleLogLevel; message: string; source: "renderer" }) => void;
    };
  }
}

export async function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  return window.electron.invoke<T>(channel, ...args);
}

// ---- Sync invalidation wiring ----
// A pluggable subscribe function injected by AppStatusProvider so useIpc can
// auto-register for sync-completion soft-refreshes without importing the context.
type SubscribeFn = (channel: string, callback: () => void) => () => void;
let _subscribeSyncInvalidation: SubscribeFn | null = null;

/** Called by AppStatusProvider to wire up the invalidation subscription. */
export function setSyncInvalidationSubscriber(fn: SubscribeFn | null): void {
  _subscribeSyncInvalidation = fn;
}

export interface IpcState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Re-invoke the channel with the same args (same as initial load). */
  refresh: () => void;
  /** Re-invoke without setting loading=true — keeps stale data visible while fetching. */
  softRefresh: () => void;
}

const noopRefresh = () => {};

export function useIpc<T>(
  channel: string | null,
  args?: unknown[],
): IpcState<T> {
  const [state, setState] = useState<Omit<IpcState<T>, "refresh" | "softRefresh">>({ data: null, loading: true, error: null });

  // Serialize args to detect changes
  const argsKey = JSON.stringify(args ?? []);

  const refresh = useCallback(() => {
    if (!channel) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    const parsed = JSON.parse(argsKey) as unknown[];
    invoke<T>(channel, ...parsed)
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((err) => setState({ data: null, loading: false, error: err?.message ?? "IPC call failed" }));
  }, [channel, argsKey]);

  const softRefresh = useCallback(() => {
    if (!channel) return;
    const parsed = JSON.parse(argsKey) as unknown[];
    invoke<T>(channel, ...parsed)
      .then((data) => setState((prev) => ({ ...prev, data, loading: false })))
      .catch(() => {
        /* keep stale data on background refresh failure */
      });
  }, [channel, argsKey]);

  useEffect(() => {
    if (!channel) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    refresh();
  }, [channel, refresh]);

  // Auto-subscribe to sync invalidation so data refreshes seamlessly after a sync.
  const softRefreshRef = useRef(softRefresh);
  softRefreshRef.current = softRefresh;
  useEffect(() => {
    if (!channel || !_subscribeSyncInvalidation) return;
    return _subscribeSyncInvalidation(channel, () => softRefreshRef.current());
  }, [channel]);

  return { ...state, refresh: channel ? refresh : noopRefresh, softRefresh: channel ? softRefresh : noopRefresh };
}
