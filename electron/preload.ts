import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  invoke: <T = unknown>(channel: string, ...args: unknown[]): Promise<T> =>
    ipcRenderer.invoke(channel, ...args) as Promise<T>,
  onMenuNavigate: (callback: (path: string) => void) => {
    ipcRenderer.on("menu:navigate", (_event, path: string) => callback(path));
  },
  onSyncProgress: (callback: (payload: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on("sync:progress", handler);
    return () => {
      ipcRenderer.removeListener("sync:progress", handler);
    };
  },
  onUpdateAvailable: (callback: (payload: { version: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { version: string }) => callback(payload);
    ipcRenderer.on("update:available", handler);
    return () => {
      ipcRenderer.removeListener("update:available", handler);
    };
  },
  onNotificationOpen: (callback: (payload: { id: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { id: string }) => callback(payload);
    ipcRenderer.on("notifications:open", handler);
    return () => {
      ipcRenderer.removeListener("notifications:open", handler);
    };
  },
  onNotificationsChanged: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("notifications:changed", handler);
    return () => {
      ipcRenderer.removeListener("notifications:changed", handler);
    };
  },
});
