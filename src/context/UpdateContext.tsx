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
import type { DownloadInstallResult } from "@/lib/types";
import { useAppStatus } from "@/context/AppStatusContext";
import { UpdateAvailableModal } from "@/components/update/UpdateAvailableModal";

interface UpdateContextValue {
  pendingUpdate: { version: string } | null;
  /** When false, the status-bar update chip is hidden (user disabled auto-update checks). */
  autoUpdateChecksEnabled: boolean;
  openUpdateModal: () => void;
  /** Set pending version and open the modal (e.g. after manual check from Settings). */
  offerUpdate: (version: string) => void;
  refreshAutoUpdatePref: () => Promise<void>;
}

const UpdateContext = createContext<UpdateContextValue | null>(null);

export function UpdateProvider({ children }: { children: ReactNode }) {
  const { pushNotification } = useAppStatus();
  const [pendingUpdate, setPendingUpdate] = useState<{ version: string } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [autoUpdateChecksEnabled, setAutoUpdateChecksEnabled] = useState(true);

  const refreshAutoUpdatePref = useCallback(async () => {
    try {
      const v = await invoke<string | null>("app-config:get", { key: "auto_update_enabled" });
      setAutoUpdateChecksEnabled(v !== "0");
    } catch {
      setAutoUpdateChecksEnabled(true);
    }
  }, []);

  useEffect(() => {
    void refreshAutoUpdatePref();
  }, [refreshAutoUpdatePref]);

  useEffect(() => {
    return window.electron.onUpdateAvailable((payload) => {
      setPendingUpdate({ version: payload.version });
    });
  }, []);

  const openUpdateModal = useCallback(() => setModalOpen(true), []);

  const offerUpdate = useCallback((version: string) => {
    setPendingUpdate({ version });
    setModalOpen(true);
  }, []);

  const closeUpdateModal = useCallback(() => setModalOpen(false), []);

  const onConfirmDownload = useCallback(async () => {
    setConfirmBusy(true);
    try {
      const result = await invoke<DownloadInstallResult>("updates:download-and-install");
      if (!result.ok) {
        pushNotification({ message: result.message, type: "error" });
        setConfirmBusy(false);
      }
    } catch (e) {
      pushNotification({
        message: e instanceof Error ? e.message : "Could not download update",
        type: "error",
      });
      setConfirmBusy(false);
    }
  }, [pushNotification]);

  const value = useMemo(
    () => ({
      pendingUpdate,
      autoUpdateChecksEnabled,
      openUpdateModal,
      offerUpdate,
      refreshAutoUpdatePref,
    }),
    [pendingUpdate, autoUpdateChecksEnabled, openUpdateModal, offerUpdate, refreshAutoUpdatePref],
  );

  return (
    <UpdateContext.Provider value={value}>
      {children}
      {pendingUpdate && (
        <UpdateAvailableModal
          open={modalOpen}
          onClose={closeUpdateModal}
          version={pendingUpdate.version}
          onConfirmDownload={onConfirmDownload}
          confirmBusy={confirmBusy}
        />
      )}
    </UpdateContext.Provider>
  );
}

export function useUpdate(): UpdateContextValue {
  const ctx = useContext(UpdateContext);
  if (!ctx) throw new Error("useUpdate must be used within UpdateProvider");
  return ctx;
}
