import { ipcMain } from "electron";
import { isNetworkOnline } from "../network-monitor";
import { syncAll, syncDeveloper, isSyncing, getSyncProgress } from "../sync/engine";
import { getDb } from "../db/index";
import { getAllSyncStatuses } from "../db/cache";

export function registerSyncHandlers() {
  ipcMain.handle("sync:trigger", (_e, data?: { developerId?: string }) => {
    if (!isNetworkOnline()) {
      return { triggered: false as const, reason: "offline" as const };
    }
    if (data?.developerId) {
      syncDeveloper(data.developerId, { scope: "single", devIndex: 1, devTotal: 1 }).catch((err) =>
        console.error("[sync:trigger] Developer sync error:", err),
      );
    } else {
      syncAll().catch((err) => console.error("[sync:trigger] Full sync error:", err));
    }
    return { triggered: true as const };
  });

  ipcMain.handle("sync:status", () => {
    const db = getDb();
    const devs = db.prepare("SELECT id, name FROM developers").all() as { id: string; name: string }[];

    const developers = devs.map((dev) => {
      const types = getAllSyncStatuses(dev.id);
      const allTimes = Object.values(types).map((t) => t.lastSyncedAt).filter(Boolean);
      const lastSyncedAt = allTimes.length > 0 ? allTimes.sort().pop()! : null;
      return { id: dev.id, name: dev.name, lastSyncedAt, types };
    });

    return {
      syncing: isSyncing(),
      developers,
      progress: getSyncProgress(),
      online: isNetworkOnline(),
    };
  });
}
