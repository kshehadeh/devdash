import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import {
  ensureNotificationPreference,
  getNotificationById,
  getNotificationPreferences,
  getUnreadNotificationCount,
  groupedNotificationsForDeveloper,
  listNotificationsForDeveloper,
  markAllNotificationsRead,
  markGroupRead,
  markNotificationRead,
  setNotificationPreference,
} from "../db/notifications";
import { getCurrentUserDeveloper } from "../db/developers";
import { getConfig, setConfig } from "../db/config";
import { emitNotificationsChanged, onNotificationOpen, onNotificationsChanged } from "../notifications/events";
import { getNotificationPollIntervalMs, pollNotifications } from "../notifications/service";
import { refreshNotificationScheduler } from "../notifications/scheduler";
import { getRegisteredNotificationDefinitions } from "../notifications/registry";

const CONFIG_ENABLED_KEY = "notifications_enabled";
const CONFIG_INTERVAL_KEY = "notifications_poll_interval_ms";

function currentUserId(): string | null {
  return getCurrentUserDeveloper()?.id ?? null;
}

export function registerNotificationHandlers(getWindow: () => BrowserWindow | null) {
  ipcMain.handle("notifications:list", (_e, data?: { limit?: number }) => {
    const devId = currentUserId();
    if (!devId) return { notifications: [], unreadCount: 0 };
    const limit = typeof data?.limit === "number" ? Math.max(1, Math.min(data.limit, 200)) : 50;
    const notifications = listNotificationsForDeveloper(devId, limit);
    const unreadCount = getUnreadNotificationCount(devId);
    return { notifications, unreadCount };
  });

  ipcMain.handle("notifications:get", (_e, data: { id: string }) => {
    if (!data?.id || typeof data.id !== "string") throw new Error("Invalid notification id");
    return getNotificationById(data.id);
  });

  ipcMain.handle("notifications:mark-read", (_e, data: { id: string }) => {
    if (!data?.id || typeof data.id !== "string") throw new Error("Invalid notification id");
    const changed = markNotificationRead(data.id);
    if (changed) emitNotificationsChanged();
    const devId = currentUserId();
    return { success: true, unreadCount: getUnreadNotificationCount(devId ?? undefined) };
  });

  ipcMain.handle("notifications:mark-all-read", () => {
    const devId = currentUserId();
    if (!devId) return { success: true, updated: 0, unreadCount: 0 };
    const updated = markAllNotificationsRead(devId);
    if (updated > 0) emitNotificationsChanged();
    return { success: true, updated, unreadCount: 0 };
  });

  ipcMain.handle("notifications:unread-count", () => {
    const devId = currentUserId();
    return { unreadCount: getUnreadNotificationCount(devId ?? undefined) };
  });

  ipcMain.handle("notifications:list-grouped", () => {
    const devId = currentUserId();
    if (!devId) return { groups: [], totalUnreadCount: 0 };
    const groups = groupedNotificationsForDeveloper(devId);
    const defs = getRegisteredNotificationDefinitions();
    const labelMap = new Map(defs.map((d) => [d.notificationType, d.label]));
    const labeled = groups.map((g) => ({
      ...g,
      label: labelMap.get(g.notificationType) ?? g.notificationType,
    }));
    const totalUnreadCount = labeled.reduce((sum, g) => sum + g.unreadCount, 0);
    return { groups: labeled, totalUnreadCount };
  });

  ipcMain.handle("notifications:mark-group-read", (_e, data: { notificationType: string }) => {
    const devId = currentUserId();
    if (!devId || !data?.notificationType) return { success: true, updated: 0, unreadCount: 0 };
    const updated = markGroupRead(devId, data.notificationType);
    if (updated > 0) emitNotificationsChanged();
    return { success: true, updated, unreadCount: getUnreadNotificationCount(devId) };
  });

  ipcMain.handle("notifications:preferences:get", () => {
    for (const def of getRegisteredNotificationDefinitions()) {
      ensureNotificationPreference({
        integration: def.integration,
        notificationType: def.notificationType,
        defaultEnabled: def.defaultEnabled,
        fingerprintStrategy: { strategyId: def.strategy.id, strategyVersion: def.strategy.version },
      });
    }
    return { preferences: getNotificationPreferences() };
  });

  ipcMain.handle(
    "notifications:preferences:set",
    (_e, data: { integration: string; notificationType: string; enabled: boolean; fingerprintStrategy?: Record<string, unknown> }) => {
      if (!data?.integration || !data?.notificationType || typeof data.enabled !== "boolean") {
        throw new Error("Invalid preference payload");
      }
      const preference = setNotificationPreference(data);
      return { preference };
    },
  );

  ipcMain.handle("notifications:config:get", () => {
    return {
      enabled: getConfig(CONFIG_ENABLED_KEY) !== "0",
      pollIntervalMs: getNotificationPollIntervalMs(),
    };
  });

  ipcMain.handle("notifications:config:set", (_e, data: { enabled: boolean; pollIntervalMs: number }) => {
    if (typeof data?.enabled !== "boolean") throw new Error("Invalid notifications enabled value");
    if (!Number.isFinite(data.pollIntervalMs)) throw new Error("Invalid poll interval");
    setConfig(CONFIG_ENABLED_KEY, data.enabled ? "1" : "0");
    setConfig(CONFIG_INTERVAL_KEY, String(Math.max(60_000, Math.floor(data.pollIntervalMs))));
    refreshNotificationScheduler(getWindow);
    return { success: true };
  });

  ipcMain.handle("notifications:check-now", async () => {
    const inserted = await pollNotifications(getWindow);
    return { inserted };
  });

  const pushOpen = onNotificationOpen((notificationId) => {
    const win = getWindow();
    win?.webContents.send("notifications:open", { id: notificationId });
  });
  const pushChanged = onNotificationsChanged(() => {
    const win = getWindow();
    win?.webContents.send("notifications:changed");
  });

  ipcMain.on("notifications:unsubscribe-events", () => {
    pushOpen();
    pushChanged();
  });
}
