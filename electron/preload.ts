import { contextBridge } from "electron";

// Expose safe APIs to the renderer process here
contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
});
