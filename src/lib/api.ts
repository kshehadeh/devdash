import { useState, useEffect, useCallback } from "react";

declare global {
  interface Window {
    electron: {
      platform: string;
      invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>;
      onMenuNavigate: (callback: (path: string) => void) => void;
    };
  }
}

export async function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  return window.electron.invoke<T>(channel, ...args);
}

export interface IpcState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useIpc<T>(
  channel: string | null,
  args?: unknown[],
): IpcState<T> {
  const [state, setState] = useState<IpcState<T>>({ data: null, loading: true, error: null });

  // Serialize args to detect changes
  const argsKey = JSON.stringify(args ?? []);

  const refresh = useCallback(() => {
    if (!channel) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    const parsed = JSON.parse(argsKey) as unknown[];
    invoke<T>(channel, ...parsed)
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((err) => setState({ data: null, loading: false, error: err?.message ?? "IPC call failed" }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, argsKey]);

  useEffect(() => {
    if (!channel) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    refresh();
  }, [channel, refresh]);

  return state;
}
