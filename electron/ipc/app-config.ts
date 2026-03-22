import { ipcMain } from "electron";
import { getConfig, setConfig } from "../db/config";

const ALLOWED_KEYS = new Set(["onboarding_completed"]);

export function registerAppConfigHandlers() {
  ipcMain.handle("app-config:get", (_e, data: { key: string }) => {
    if (!ALLOWED_KEYS.has(data.key)) throw new Error("Invalid config key");
    return getConfig(data.key);
  });

  ipcMain.handle("app-config:set", (_e, data: { key: string; value: string }) => {
    if (!ALLOWED_KEYS.has(data.key)) throw new Error("Invalid config key");
    if (typeof data.value !== "string") throw new Error("Invalid config value");
    setConfig(data.key, data.value);
    return { success: true };
  });
}
