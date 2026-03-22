import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  invoke: <T = unknown>(channel: string, ...args: unknown[]): Promise<T> =>
    ipcRenderer.invoke(channel, ...args) as Promise<T>,
  onMenuNavigate: (callback: (path: string) => void) => {
    ipcRenderer.on("menu:navigate", (_event, path: string) => callback(path));
  },
});
