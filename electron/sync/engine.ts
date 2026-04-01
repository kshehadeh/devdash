import { isNetworkOnline } from "../network-monitor";
import { getDb } from "../db/index";
import { getRegisteredSyncTasks } from "../integrations/sync-registry";
import { syncConfluenceSpaceList } from "./atlassian-sync";
import { broadcastSyncProgress, broadcastSyncWarning, type SyncProgressPayload } from "./progress-broadcast";
import { getConnection, hasUsableToken } from "../db/connections";
import { getIntegrationSettings } from "../db/integration-settings";

/** How old repo-level sync data must be before re-syncing (10 min). */
const REPO_SYNC_MIN_AGE_MS = 10 * 60 * 1000;
/** Max number of repos synced in parallel. */
const REPO_SYNC_CONCURRENCY = 3;

let _syncing = false;
/** Non-silent syncDeveloper calls in flight (manual / full sync tasks). */
let _foregroundSyncDepth = 0;
/** Categories synced in the current foreground run — accumulated across chained syncDeveloper calls. */
let _syncedCategories = new Set<string>();

function idleProgress(): SyncProgressPayload {
  let n = 1;
  try {
    n = Math.max(1, getRegisteredSyncTasks().length);
  } catch {
    // DB not ready yet (e.g. before ensureDatabaseReady)
  }
  return {
    syncing: false,
    scope: "idle",
    completedSteps: 0,
    totalSteps: n,
    activeLabels: [],
    phase: "sync",
  };
}

let _progress: SyncProgressPayload | null = null;

function progressState(): SyncProgressPayload {
  if (_progress === null) _progress = idleProgress();
  return _progress;
}

export function getSyncProgress(): SyncProgressPayload {
  const p = progressState();
  return { ...p, activeLabels: [...p.activeLabels] };
}

function emitProgress(patch: Partial<SyncProgressPayload>) {
  const base = progressState();
  _progress = {
    ...base,
    ...patch,
    activeLabels: patch.activeLabels ?? base.activeLabels,
  };
  broadcastSyncProgress(_progress);
}

function resetProgress(completedCategories?: string[]) {
  _progress = { ...idleProgress(), completedCategories };
  broadcastSyncProgress(_progress);
}

export interface SyncDeveloperOptions {
  scope?: "full" | "single";
  devIndex?: number;
  devTotal?: number;
  /** Background cache refresh — no status-bar progress. */
  silent?: boolean;
}

export async function syncDeveloper(developerId: string, opts: SyncDeveloperOptions = {}): Promise<void> {
  const { scope = "single", devIndex = 1, devTotal = 1, silent = false } = opts;

  if (!isNetworkOnline()) return;

  // For single-developer syncs, run repo-level sync scoped to this developer's repos only
  if (scope === "single" && !silent) {
    await syncReposForDeveloper(developerId).catch((err) =>
      console.error("[Sync] Repo-level GitHub sync error (single dev):", err),
    );
  }

  const db = getDb();
  const row = db.prepare("SELECT name FROM developers WHERE id = ?").get(developerId) as { name: string } | undefined;
  const developerName = row?.name ?? "Developer";

  const specs = getRegisteredSyncTasks();
  const TASKS = specs.map((s) => ({
    label: s.label,
    fn: () => s.run(developerId),
  }));

  // Track which data categories are being synced
  for (const s of specs) _syncedCategories.add(s.category);

  if (silent) {
    const results = await Promise.allSettled(TASKS.map((t) => t.fn()));
    for (const r of results) {
      if (r.status === "rejected") {
        console.error(`[Sync] Developer ${developerId} sync error:`, r.reason);
      }
    }
    return;
  }

  _foregroundSyncDepth++;
  let completed = 0;
  const active = new Set(TASKS.map((t) => t.label));

  const push = () => {
    emitProgress({
      syncing: true,
      scope,
      developerName,
      developerIndex: devIndex,
      developerTotal: devTotal,
      completedSteps: completed,
      totalSteps: TASKS.length,
      activeLabels: [...active],
      phase: "sync",
    });
  };

  try {
    push();

    const results = await Promise.allSettled(
      TASKS.map(async (task) => {
        try {
          await task.fn();
        } finally {
          active.delete(task.label);
          completed++;
          push();
        }
      }),
    );

    for (const r of results) {
      if (r.status === "rejected") {
        console.error(`[Sync] Developer ${developerId} sync error:`, r.reason);
      }
    }
  } finally {
    _foregroundSyncDepth--;
    if (_foregroundSyncDepth === 0 && !_syncing) {
      const cats = [..._syncedCategories];
      _syncedCategories = new Set();
      resetProgress(cats);
    }
  }
}

export async function syncAll(): Promise<void> {
  if (_syncing) {
    console.log("[Sync] Already syncing, skipping");
    return;
  }
  if (!isNetworkOnline()) return;
  _syncing = true;

  try {
    const db = getDb();
    const devs = db.prepare("SELECT id, name FROM developers").all() as { id: string; name: string }[];

    if (devs.length === 0) {
      console.log("[Sync] No developers to sync");
      return;
    }

    // Check connections and warn if selected integrations are missing tokens
    const settings = getIntegrationSettings();

    if (settings.code === "github") {
      const ghConn = getConnection("github");
      if (!hasUsableToken(ghConn)) {
        broadcastSyncWarning({ provider: "github", message: "GitHub not connected — sync will skip code data" });
      }
    }

    if (settings.work === "jira" || settings.docs === "confluence") {
      const atConn = getConnection("atlassian");
      if (!atConn?.connected || !atConn.token) {
        broadcastSyncWarning({ provider: "atlassian", message: "Atlassian not connected — sync will skip work/docs data" });
      }
    }

    if (settings.work === "linear") {
      const linearConn = getConnection("linear");
      if (!linearConn?.connected || !linearConn.token) {
        broadcastSyncWarning({ provider: "linear", message: "Linear not connected — sync will skip work data" });
      }
    }

    console.log(`[Sync] Starting sync for ${devs.length} developer(s)`);

    // Phase 1: Org-level data
    emitProgress({
      syncing: true,
      scope: "full",
      completedSteps: 0,
      totalSteps: 1,
      activeLabels: ["Syncing Confluence spaces"],
      phase: "sync",
    });

    await syncConfluenceSpaceList().catch((err) =>
      console.error("[Sync] Confluence space list sync error:", err),
    );

    // Phase 2: Repo-level GitHub data (shared across developers)
    const repoCount = await syncAllReposOnce();
    if (repoCount > 0) {
      emitProgress({
        syncing: true,
        scope: "full",
        completedSteps: 1,
        totalSteps: 1,
        activeLabels: [`Synced ${repoCount} GitHub ${repoCount === 1 ? "repo" : "repos"}`],
        phase: "sync",
      });
    }

    // Phase 3: Developer-specific data
    for (let i = 0; i < devs.length; i++) {
      await syncDeveloper(devs[i].id, {
        scope: "full",
        devIndex: i + 1,
        devTotal: devs.length,
        silent: false,
      });
    }

    // Phase 4: Cleanup
    emitProgress({
      syncing: true,
      scope: "full",
      developerName: undefined,
      developerIndex: devs.length,
      developerTotal: devs.length,
      completedSteps: 0,
      totalSteps: 1,
      activeLabels: ["Pruning stale cache"],
      phase: "prune",
    });

    pruneStaleData();

    console.log("[Sync] All syncs complete");
  } finally {
    _syncing = false;
    const cats = [..._syncedCategories];
    _syncedCategories = new Set();
    resetProgress(cats);
  }
}

/** Runs up to `limit` async tasks concurrently, similar to Promise.allSettled but bounded. */
async function withConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let next = 0;

  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await tasks[i]() };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

/**
 * Syncs repo-level GitHub data (review comments + PR reviews) for the given repos,
 * processing up to REPO_SYNC_CONCURRENCY repos in parallel and skipping repos
 * whose data was successfully synced within REPO_SYNC_MIN_AGE_MS.
 */
async function syncRepos(
  token: string,
  repos: Array<{ org: string; name: string }>,
  scope: "full" | "single" = "single",
): Promise<number> {
  if (repos.length === 0) return 0;

  const { syncRepoPRReviewComments, syncRepoPRReviews, isRepoSyncFresh } = await import("./github-repo-sync");
  let completed = 0;

  const tasks = repos.map((repo) => async () => {
    const repoName = `${repo.org}/${repo.name}`;

    emitProgress({
      syncing: true,
      scope,
      completedSteps: completed,
      totalSteps: repos.length,
      activeLabels: [`Syncing GitHub repo: ${repoName}`],
      phase: "sync",
    });

    const commentsFresh = isRepoSyncFresh(repo.org, repo.name, "pr_review_comments", REPO_SYNC_MIN_AGE_MS);
    const reviewsFresh = isRepoSyncFresh(repo.org, repo.name, "pr_reviews", REPO_SYNC_MIN_AGE_MS);

    if (!commentsFresh) {
      try {
        await syncRepoPRReviewComments(token, repo);
      } catch (err) {
        console.error(`[Sync] Repo ${repoName} PR review comments sync error:`, err);
      }
    } else {
      console.log(`[Sync] Repo ${repoName} PR review comments are fresh, skipping`);
    }

    if (!reviewsFresh) {
      try {
        await syncRepoPRReviews(token, repo);
      } catch (err) {
        console.error(`[Sync] Repo ${repoName} PR reviews sync error:`, err);
      }
    } else {
      console.log(`[Sync] Repo ${repoName} PR reviews are fresh, skipping`);
    }

    completed++;
  });

  await withConcurrency(tasks, REPO_SYNC_CONCURRENCY);
  return repos.length;
}

async function syncAllReposOnce(): Promise<number> {
  const db = getDb();
  const { getConnection } = await import("../db/connections");
  const ghConn = getConnection("github");
  if (!ghConn?.connected || !ghConn.token) return 0;

  const allSources = db.prepare(
    "SELECT DISTINCT org, identifier FROM data_sources WHERE type = 'github_repo'",
  ).all() as Array<{ org: string; identifier: string }>;

  const uniqueRepos = allSources.map((s) => ({ org: s.org, name: s.identifier }));
  if (uniqueRepos.length === 0) return 0;

  console.log(`[Sync] Syncing ${uniqueRepos.length} unique GitHub repo(s)`);
  return syncRepos(ghConn.token, uniqueRepos, "full");
}

/** Syncs repo-level data scoped only to the given developer's assigned repos. */
async function syncReposForDeveloper(developerId: string): Promise<number> {
  const { getConnection } = await import("../db/connections");
  const ghConn = getConnection("github");
  if (!ghConn?.connected || !ghConn.token) return 0;

  const { getSourcesForDeveloper } = await import("../db/sources");
  const repos = getSourcesForDeveloper(developerId)
    .filter((s) => s.type === "github_repo")
    .map((s) => ({ org: s.org, name: s.identifier }));

  if (repos.length === 0) return 0;

  console.log(`[Sync] Syncing ${repos.length} repo(s) for developer ${developerId}`);
  return syncRepos(ghConn.token, repos, "single");
}

export function isSyncing(): boolean {
  return _syncing || _foregroundSyncDepth > 0;
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

    // 5. Prune linear issues not updated in over 1 year
    const r5 = db.prepare("DELETE FROM cached_linear_issues WHERE updated_at < ?").run(cutoff);
    totalDeleted += r5.changes;

    // 6. Prune PR review comments older than 1 year
    const r6 = db.prepare("DELETE FROM cached_pr_review_comments WHERE created_at < ?").run(cutoff);
    totalDeleted += r6.changes;

    // 6b. Prune PR approvals and received-comment cache older than 1 year
    const r6b = db.prepare("DELETE FROM cached_pr_approvals_given WHERE submitted_at < ?").run(cutoff);
    totalDeleted += r6b.changes;
    const r6c = db.prepare("DELETE FROM cached_pr_comments_received WHERE created_at < ?").run(cutoff);
    totalDeleted += r6c.changes;

    // 7. Remove orphaned cache data for deleted developers
    const orphanTables = [
      "cached_contributions", "cached_pull_requests", "cached_review_requests",
      "cached_jira_tickets", "cached_confluence_pages", "cached_linear_issues",
      "cached_pr_review_comments", "cached_pr_approvals_given", "cached_pr_comments_received",
      "sync_log",
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
