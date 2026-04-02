import { ipcMain } from "electron";
import { isNetworkOnline } from "../network-monitor";
import { syncAll, syncDeveloper, isSyncing, getSyncProgress } from "../sync/engine";
import { getDb } from "../db/index";
import { getAllSyncStatuses } from "../db/cache";

export interface SyncErrorEntry {
  scope: "developer" | "repo";
  developerName?: string;
  repoName?: string;
  dataType: string;
  errorMessage: string;
  lastSyncedAt: string;
}

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

  ipcMain.handle("sync:errors", () => {
    const db = getDb();
    const errors: SyncErrorEntry[] = [];

    // Query developer-level sync errors from sync_log
    const devErrors = db.prepare(
      `SELECT sl.developer_id, d.name, sl.data_type, sl.error_message, sl.last_synced_at
       FROM sync_log sl
       JOIN developers d ON d.id = sl.developer_id
       WHERE sl.status = 'error' AND sl.error_message IS NOT NULL`
    ).all() as Array<{
      developer_id: string;
      name: string;
      data_type: string;
      error_message: string;
      last_synced_at: string;
    }>;

    for (const row of devErrors) {
      errors.push({
        scope: "developer",
        developerName: row.name,
        dataType: row.data_type,
        errorMessage: row.error_message,
        lastSyncedAt: row.last_synced_at,
      });
    }

    // Query repo-level sync errors from repo_sync_log
    const repoErrors = db.prepare(
      `SELECT org, repo, data_type, error_message, last_synced_at
       FROM repo_sync_log
       WHERE status = 'error' AND error_message IS NOT NULL`
    ).all() as Array<{
      org: string;
      repo: string;
      data_type: string;
      error_message: string;
      last_synced_at: string;
    }>;

    for (const row of repoErrors) {
      errors.push({
        scope: "repo",
        repoName: `${row.org}/${row.repo}`,
        dataType: row.data_type,
        errorMessage: row.error_message,
        lastSyncedAt: row.last_synced_at,
      });
    }

    return errors;
  });
}
