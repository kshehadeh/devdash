import { contextBridge, ipcRenderer } from "electron";

export type AboutUpdateCheckResult =
  | { status: "up-to-date" }
  | { status: "available"; version: string }
  | { status: "skipped"; reason: string }
  | { status: "error"; message: string };

contextBridge.exposeInMainWorld("aboutShell", {
  checkForUpdates: (): Promise<AboutUpdateCheckResult> => ipcRenderer.invoke("updates:check"),
});
