"use client";

import { useState, useEffect, useRef } from "react";

export interface SectionState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useSectionFetch<T>(url: string | null): SectionState<T> {
  const [state, setState] = useState<SectionState<T>>({ data: null, loading: true, error: null });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!url) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<T>;
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setState({ data, loading: false, error: null });
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setState({ data: null, loading: false, error: err.message ?? "Fetch failed" });
        }
      });

    return () => controller.abort();
  }, [url]);

  return state;
}
