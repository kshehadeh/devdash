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

const STORAGE_KEY = "devdash.selectedDevId";

interface SelectedDeveloperContextValue {
  selectedDevId: string;
  setSelectedDevId: (id: string) => void;
}

const SelectedDeveloperContext = createContext<SelectedDeveloperContextValue | null>(null);

export function SelectedDeveloperProvider({ children }: { children: ReactNode }) {
  const [selectedDevId, setSelectedDevIdState] = useState(() => localStorage.getItem(STORAGE_KEY) ?? "");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, selectedDevId);
  }, [selectedDevId]);

  const setSelectedDevId = useCallback((id: string) => {
    setSelectedDevIdState(id);
  }, []);

  const value = useMemo(
    () => ({ selectedDevId, setSelectedDevId }),
    [selectedDevId, setSelectedDevId],
  );

  return (
    <SelectedDeveloperContext.Provider value={value}>{children}</SelectedDeveloperContext.Provider>
  );
}

export function useSelectedDeveloper(): SelectedDeveloperContextValue {
  const ctx = useContext(SelectedDeveloperContext);
  if (!ctx) throw new Error("useSelectedDeveloper must be used within SelectedDeveloperProvider");
  return ctx;
}
