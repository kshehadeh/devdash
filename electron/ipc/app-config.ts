import { ipcMain } from "electron";
import { getConfig, setConfig } from "../db/config";

const ALLOWED_KEYS = new Set([
  "onboarding_completed",
  "auto_update_enabled",
  "notifications_enabled",
  "notifications_poll_interval_ms",
  /** Integer days — open authored PR with zero reviews and age ≥ this triggers warn-tier stale notifications */
  "pr_stale_warn_days",
  /** Integer days — same but danger-tier */
  "pr_stale_danger_days",
  /** JSON string: ordered dashboard widget ids for layout customization */
  "dashboard_widget_layout_json",
  /** "0" to disable the menu bar tray icon; anything else (or absent) means enabled */
  "tray_enabled",
]);

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
