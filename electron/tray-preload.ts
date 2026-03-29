import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("trayShell", {
  getItems: () => ipcRenderer.invoke("tray:get-items"),
  openExternal: (url: string) => ipcRenderer.invoke("tray:open-external", { url }),
  focusMain: () => ipcRenderer.invoke("tray:focus-main"),
  openSettings: () => ipcRenderer.invoke("tray:open-settings"),
});
