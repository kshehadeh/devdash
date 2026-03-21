import { useState, useEffect, useRef, useCallback } from "react";

declare global {
  interface Window {
    electron: {
      platform: string;
      invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>;
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
  const argsRef = useRef(args);
  argsRef.current = args;

  const refresh = useCallback(() => {
    if (!channel) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    invoke<T>(channel, ...(argsRef.current ?? []))
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((err) => setState({ data: null, loading: false, error: err?.message ?? "IPC call failed" }));
  }, [channel]);

  useEffect(() => {
    if (!channel) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    refresh();
  }, [channel, refresh]);

  return state;
}
