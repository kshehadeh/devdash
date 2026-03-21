import { getDb } from "../db/index";
import { syncContributions, syncPullRequests } from "./github-sync";
import { syncJiraTickets, syncConfluencePages } from "./atlassian-sync";

let _syncing = false;

export async function syncDeveloper(developerId: string): Promise<void> {
  const syncFns = [
    () => syncContributions(developerId),
    () => syncPullRequests(developerId),
    () => syncJiraTickets(developerId),
    () => syncConfluencePages(developerId),
  ];

  const results = await Promise.allSettled(syncFns.map((fn) => fn()));
  for (const r of results) {
    if (r.status === "rejected") {
      console.error(`[Sync] Developer ${developerId} sync error:`, r.reason);
    }
  }
}

export async function syncAll(): Promise<void> {
  if (_syncing) {
    console.log("[Sync] Already syncing, skipping");
    return;
  }
  _syncing = true;

  try {
    const db = getDb();
    const devs = db.prepare("SELECT id FROM developers").all() as { id: string }[];

    if (devs.length === 0) {
      console.log("[Sync] No developers to sync");
      return;
    }

    console.log(`[Sync] Starting sync for ${devs.length} developer(s)`);

    for (const dev of devs) {
      try {
        await syncDeveloper(dev.id);
        console.log(`[Sync] Completed sync for developer ${dev.id}`);
      } catch (err) {
        console.error(`[Sync] Failed sync for developer ${dev.id}:`, err);
      }
    }

    // Clean up stale data after every full sync
    pruneStaleData();

    console.log("[Sync] All syncs complete");
  } finally {
    _syncing = false;
  }
}

export function isSyncing(): boolean {
  return _syncing;
}

// ---------- Data Cleanup ----------

function pruneStaleData(): void {
  const db = getDb();
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const cutoff = oneYearAgo.toISOString();
  const cutoffDate = cutoff.split("T")[0]; // YYYY-MM-DD for date-only columns

  // Get current developer IDs to detect orphans
  const currentDevIds = new Set(
    (db.prepare("SELECT id FROM developers").all() as { id: string }[]).map((d) => d.id),
  );

  let totalDeleted = 0;

  db.transaction(() => {
    // 1. Prune contributions older than 1 year
    const r1 = db.prepare("DELETE FROM cached_contributions WHERE date < ?").run(cutoffDate);
    totalDeleted += r1.changes;

    // 2. Prune pull requests created more than 1 year ago (closed ones only — keep open PRs regardless of age)
    const r2 = db.prepare("DELETE FROM cached_pull_requests WHERE created_at < ? AND status != 'open'").run(cutoff);
    totalDeleted += r2.changes;

    // 3. Prune jira tickets not updated in over 1 year
    const r3 = db.prepare("DELETE FROM cached_jira_tickets WHERE updated_at < ?").run(cutoff);
    totalDeleted += r3.changes;

    // 4. Prune confluence pages not modified in over 1 year
    const r4 = db.prepare("DELETE FROM cached_confluence_pages WHERE last_modified < ?").run(cutoff);
    totalDeleted += r4.changes;

    // 5. Remove orphaned cache data for deleted developers
    const orphanTables = [
      "cached_contributions", "cached_pull_requests",
      "cached_jira_tickets", "cached_confluence_pages", "sync_log",
    ];
    for (const table of orphanTables) {
      const rows = db.prepare(`SELECT DISTINCT developer_id FROM ${table}`).all() as { developer_id: string }[];
      for (const row of rows) {
        if (!currentDevIds.has(row.developer_id)) {
          const r = db.prepare(`DELETE FROM ${table} WHERE developer_id = ?`).run(row.developer_id);
          totalDeleted += r.changes;
        }
      }
    }
  })();

  if (totalDeleted > 0) {
    console.log(`[Sync] Pruned ${totalDeleted} stale cache rows`);
  }
}
