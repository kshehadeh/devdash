import { BrowserWindow } from "electron";

export type SyncScope = "idle" | "full" | "single";

export interface SyncProgressPayload {
  syncing: boolean;
  scope: SyncScope;
  developerName?: string;
  developerIndex?: number;
  developerTotal?: number;
  completedSteps: number;
  totalSteps: number;
  activeLabels: string[];
  phase: "sync" | "prune";
  /** Present on the final idle broadcast — lists data categories that were synced. */
  completedCategories?: string[];
}

export interface SyncWarningPayload {
  provider: "github" | "atlassian" | "linear";
  message: string;
}

export function broadcastSyncProgress(payload: SyncProgressPayload): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("sync:progress", payload);
    }
  }
}

export function broadcastSyncWarning(payload: SyncWarningPayload): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("sync:warning", payload);
    }
  }
}
