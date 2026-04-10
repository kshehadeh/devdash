// @ts-nocheck — fetch().json() returns unknown in strict mode
import { getDb } from "../db/index";
import { getConnection, hasUsableToken } from "../db/connections";
import { getDeveloper } from "../db/developers";
import { getSourcesForDeveloper } from "../db/sources";
import {
  fetchContributionCalendar,
  fetchReviewRequests,
  mergedAtFromSearchIssueItem,
} from "../services/github";

const GITHUB_API = "https://api.github.com";

/** Contributions change at most a few times per day; no need to re-fetch every 15 min. */
const CONTRIBUTION_SYNC_MIN_AGE_MS = 60 * 60 * 1000; // 1 hour

function isDevSyncFresh(developerId: string, dataType: string, maxAgeMs: number): boolean {
  const db = getDb();
  const row = db.prepare(
    "SELECT last_synced_at, status FROM sync_log WHERE developer_id = ? AND data_type = ?",
  ).get(developerId, dataType) as { last_synced_at: string; status: string } | undefined;
  if (!row || row.status !== "ok") return false;
  return Date.now() - new Date(row.last_synced_at).getTime() < maxAgeMs;
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

interface SearchPRItem {
  number: number;
  title: string;
  state: string;
  pull_request?: { merged_at: string | null } | null;
  merged_at?: string | null;
  created_at: string;
  updated_at: string;
  repository_url: string;
  requested_reviewers?: { login: string }[];
  review_comments?: number;
  user?: { login: string };
}

// Note: Review data (reviewCount, latestState, firstReviewSubmittedAt) now comes from repo-level sync
// This avoids duplicate API calls for /repos/{repo}/pulls/{pr}/reviews
function preparePullForCache(pr: SearchPRItem) {
  const repoPath = pr.repository_url.replace("https://api.github.com/repos/", "");
  const pendingLogins = (pr.requested_reviewers ?? []).map((r) => r.login);
  const pendingJson = pr.state !== "open" ? "[]" : JSON.stringify(pendingLogins);

  return { pr, repoPath, pendingJson };
}

// ---------- Contributions Sync ----------

export async function syncContributions(developerId: string): Promise<void> {
  const db = getDb();
  const dev = getDeveloper(developerId);
  const ghConn = getConnection("github");
  if (!dev?.githubUsername || !hasUsableToken(ghConn)) return;

  if (isDevSyncFresh(developerId, "github_contributions", CONTRIBUTION_SYNC_MIN_AGE_MS)) {
    console.log(`[Sync] Skipping contributions sync for ${developerId} — data is fresh (<1h old)`);
    return;
  }

  setSyncStatus(developerId, "github_contributions", "syncing");

  try {
    const { commits, totalContributions } = await fetchContributionCalendar(ghConn.token, dev.githubUsername);

    const upsert = db.prepare(
      "INSERT OR REPLACE INTO cached_contributions (developer_id, date, count) VALUES (?, ?, ?)",
    );
    const del = db.prepare("DELETE FROM cached_contributions WHERE developer_id = ?");

    db.transaction(() => {
      del.run(developerId);
      for (const day of commits) {
        upsert.run(developerId, day.date, day.count);
      }
    })();

    setSyncStatus(developerId, "github_contributions", "ok", null, String(totalContributions));
  } catch (err) {
    setSyncStatus(developerId, "github_contributions", "error", String(err));
    throw err;
  }
}

// ---------- Pull Requests Sync ----------

export async function syncPullRequests(developerId: string): Promise<void> {
  const db = getDb();
  const dev = getDeveloper(developerId);
  const ghConn = getConnection("github");
  if (!dev?.githubUsername || !hasUsableToken(ghConn)) return;

  const token = ghConn.token;
  const username = dev.githubUsername;

  const devSources = getSourcesForDeveloper(developerId);
  const ghRepos = devSources
    .filter((s) => s.type === "github_repo")
    .map((s) => ({ org: s.org, name: s.identifier }));

  const repoFilter = " " + ghRepos.map((r) => `repo:${r.org}/${r.name}`).join(" ");

  setSyncStatus(developerId, "github_pull_requests", "syncing");

  try {
    if (ghRepos.length === 0) {
      db.transaction(() => {
        db.prepare("DELETE FROM cached_pull_requests WHERE developer_id = ?").run(developerId);
        db.prepare("DELETE FROM cached_review_requests WHERE developer_id = ?").run(developerId);
      })();
      // Clear last_cursor so the next sync after repos are assigned does a full lookback, not "since today".
      setSyncStatus(developerId, "github_pull_requests", "ok", null, null);
      return;
    }

    // Determine start date: incremental from last cursor, or 90 days for first sync
    const syncLog = db.prepare(
      "SELECT last_cursor FROM sync_log WHERE developer_id = ? AND data_type = 'github_pull_requests'",
    ).get(developerId) as { last_cursor: string | null } | undefined;

    let since: string;
    if (syncLog?.last_cursor) {
      since = syncLog.last_cursor;
    } else {
      const d = new Date();
      d.setDate(d.getDate() - 90);
      since = d.toISOString().split("T")[0];
    }

    const allPRs: SearchPRItem[] = [];

    // Fetch all PRs (open + closed + merged) updated since cursor
    const q = `type:pr author:${username} updated:>=${since}${repoFilter} sort:updated-asc`.trim();
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const url = `${GITHUB_API}/search/issues?q=${encodeURIComponent(q)}&per_page=100&page=${page}`;
      const res = await fetch(url, { headers: headers(token) });
      if (!res.ok) break;

      const data = await res.json();
      const items: SearchPRItem[] = data.items ?? [];
      allPRs.push(...items);

      hasMore = items.length === 100 && page < 10; // Safety cap at 1000 PRs
      page++;
    }

    const reviewQueuePromise = fetchReviewRequests(token, username, ghRepos, 100);

    const incrementalPrepared = allPRs.map((pr) => preparePullForCache(pr));

    // On the first sync (no prior cursor), also fetch open PRs explicitly to cover any that
    // haven't been recently updated and would be missed by the incremental query.
    // On subsequent syncs the incremental query already covers all recently-touched PRs,
    // and idle open PRs retain accurate cached data (their metadata only changes on update).
    const openPrepared: ReturnType<typeof preparePullForCache>[] = [];
    if (!syncLog?.last_cursor) {
      const openQ = `type:pr is:open author:${username}${repoFilter} sort:updated-desc`.trim();
      const openUrl = `${GITHUB_API}/search/issues?q=${encodeURIComponent(openQ)}&per_page=30`;
      const openRes = await fetch(openUrl, { headers: headers(token) });
      const openItems: SearchPRItem[] = openRes.ok ? ((await openRes.json()).items ?? []) : [];
      openPrepared.push(...openItems.map((pr) => preparePullForCache(pr)));
    }

    const reviewQueue = await reviewQueuePromise;

    const upsert = db.prepare(`
      INSERT INTO cached_pull_requests
        (developer_id, pr_number, repo, title, status, review_count, created_at, updated_at, merged_at, latest_review_state, pending_reviewers_json, first_review_submitted_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, NULL, ?, NULL)
      ON CONFLICT(developer_id, pr_number, repo) DO UPDATE SET
        title = excluded.title,
        status = excluded.status,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        merged_at = excluded.merged_at,
        pending_reviewers_json = excluded.pending_reviewers_json
    `);

    const insertReviewReq = db.prepare(`
      INSERT OR REPLACE INTO cached_review_requests
        (developer_id, repo, pr_number, title, author_login, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    let latestUpdated = since;

    // Track which (repo, pr_number) pairs are touched in this sync cycle
    const touchedPRKeys = new Set<string>();

    db.transaction(() => {
      const runUpsert = (e: ReturnType<typeof preparePullForCache>) => {
        const pr = e.pr;
        const mergedAt = mergedAtFromSearchIssueItem(pr);
        let status: "open" | "merged" | "closed" = "open";
        if (mergedAt) status = "merged";
        else if (pr.state === "closed") status = "closed";

        upsert.run(
          developerId,
          pr.number,
          e.repoPath,
          pr.title,
          status,
          pr.created_at,
          pr.updated_at,
          mergedAt,
          e.pendingJson,
        );

        touchedPRKeys.add(`${e.repoPath}:${pr.number}`);
        if (pr.updated_at > latestUpdated) latestUpdated = pr.updated_at;
      };

      for (const e of incrementalPrepared) runUpsert(e);
      for (const e of openPrepared) runUpsert(e);

      db.prepare("DELETE FROM cached_review_requests WHERE developer_id = ?").run(developerId);
      for (const r of reviewQueue) {
        insertReviewReq.run(developerId, r.repo, r.number, r.title, r.authorLogin, r.updatedAt);
      }
    })();

    // Reconcile cached open PRs that weren't returned by this sync's search queries.
    // This catches PRs merged/closed since the last sync but missed due to search index lag,
    // pagination caps, or transient API failures.
    const staleOpenRows = db.prepare(
      "SELECT pr_number, repo FROM cached_pull_requests WHERE developer_id = ? AND status = 'open'",
    ).all(developerId) as { pr_number: number; repo: string }[];

    const unverified = staleOpenRows.filter(
      (row) => !touchedPRKeys.has(`${row.repo}:${row.pr_number}`),
    );

    if (unverified.length > 0) {
      const RECONCILE_CONCURRENCY = 5;
      const updateStatus = db.prepare(`
        UPDATE cached_pull_requests
        SET status = ?, merged_at = ?, pending_reviewers_json = '[]'
        WHERE developer_id = ? AND repo = ? AND pr_number = ?
      `);

      const reconcileOne = async (row: { pr_number: number; repo: string }) => {
        try {
          const res = await fetch(`${GITHUB_API}/repos/${row.repo}/pulls/${row.pr_number}`, {
            headers: headers(token),
          });
          if (!res.ok) return;
          const pr = await res.json();
          if (pr.state === "open") return;

          const mergedAt: string | null = pr.merged_at ?? null;
          const newStatus = mergedAt ? "merged" : "closed";
          updateStatus.run(newStatus, mergedAt, developerId, row.repo, row.pr_number);
        } catch {
          // ignore individual reconciliation failures
        }
      };

      for (let i = 0; i < unverified.length; i += RECONCILE_CONCURRENCY) {
        await Promise.allSettled(
          unverified.slice(i, i + RECONCILE_CONCURRENCY).map(reconcileOne),
        );
      }
    }

    setSyncStatus(developerId, "github_pull_requests", "ok", null, latestUpdated.split("T")[0]);
  } catch (err) {
    setSyncStatus(developerId, "github_pull_requests", "error", String(err));
    throw err;
  }
}

// ---------- PR Review Comments Sync (now uses repo-level cache) ----------

export async function syncPRReviewComments(developerId: string): Promise<void> {
  const db = getDb();
  const dev = getDeveloper(developerId);
  const ghConn = getConnection("github");
  if (!dev?.githubUsername || !hasUsableToken(ghConn)) return;

  const username = dev.githubUsername;

  const devSources = getSourcesForDeveloper(developerId);
  const ghRepos = devSources
    .filter((s) => s.type === "github_repo")
    .map((s) => ({ org: s.org, name: s.identifier }));

  if (ghRepos.length === 0) {
    setSyncStatus(developerId, "github_pr_review_comments", "ok");
    return;
  }

  setSyncStatus(developerId, "github_pr_review_comments", "syncing");

  try {
    // Repo-level data is already synced — just distribute to this developer
    const { distributeRepoCommentsToDevs } = await import("./github-repo-sync");
    distributeRepoCommentsToDevs(developerId, username, ghRepos);

    // Update developer sync status (use repo's latest cursor as reference)
    let latestCursor: string | null = null;
    for (const repo of ghRepos) {
      const log = db.prepare(
        "SELECT last_cursor FROM repo_sync_log WHERE org = ? AND repo = ? AND data_type = 'pr_review_comments'",
      ).get(repo.org, repo.name) as { last_cursor: string | null } | undefined;
      if (log?.last_cursor && (!latestCursor || log.last_cursor > latestCursor)) {
        latestCursor = log.last_cursor;
      }
    }

    setSyncStatus(developerId, "github_pr_review_comments", "ok", null, latestCursor);
  } catch (err) {
    setSyncStatus(developerId, "github_pr_review_comments", "error", String(err));
    throw err;
  }
}

// ---------- PR approvals (APPROVED reviews) sync (now uses repo-level cache) ----------

export async function syncPRApprovalsGiven(developerId: string): Promise<void> {
  const db = getDb();
  const dev = getDeveloper(developerId);
  const ghConn = getConnection("github");
  if (!dev?.githubUsername || !hasUsableToken(ghConn)) return;

  const username = dev.githubUsername;

  const devSources = getSourcesForDeveloper(developerId);
  const ghRepos = devSources
    .filter((s) => s.type === "github_repo")
    .map((s) => ({ org: s.org, name: s.identifier }));

  if (ghRepos.length === 0) {
    setSyncStatus(developerId, "github_pr_approvals_given", "ok");
    return;
  }

  setSyncStatus(developerId, "github_pr_approvals_given", "syncing");

  try {
    // Repo-level data is already synced — just distribute to this developer
    const { distributeRepoReviewsToDevs } = await import("./github-repo-sync");
    distributeRepoReviewsToDevs(developerId, username, ghRepos);

    // Update developer sync status (use repo's latest cursor as reference)
    let latestCursor: string | null = null;
    for (const repo of ghRepos) {
      const log = db.prepare(
        "SELECT last_cursor FROM repo_sync_log WHERE org = ? AND repo = ? AND data_type = 'pr_reviews'",
      ).get(repo.org, repo.name) as { last_cursor: string | null } | undefined;
      if (log?.last_cursor && (!latestCursor || log.last_cursor > latestCursor)) {
        latestCursor = log.last_cursor;
      }
    }

    const cursorOut = latestCursor?.includes("T") ? latestCursor.split("T")[0] : latestCursor;
    setSyncStatus(developerId, "github_pr_approvals_given", "ok", null, cursorOut);
  } catch (err) {
    setSyncStatus(developerId, "github_pr_approvals_given", "error", String(err));
    throw err;
  }
}

// ---------- Helpers ----------

function setSyncStatus(
  developerId: string,
  dataType: string,
  status: "ok" | "error" | "syncing",
  errorMessage?: string | null,
  cursor?: string | null,
) {
  const db = getDb();
  if (cursor !== undefined) {
    db.prepare(`
      INSERT INTO sync_log (developer_id, data_type, last_synced_at, status, error_message, last_cursor)
      VALUES (?, ?, datetime('now'), ?, ?, ?)
      ON CONFLICT(developer_id, data_type) DO UPDATE SET
        last_synced_at = datetime('now'), status = excluded.status,
        error_message = excluded.error_message, last_cursor = excluded.last_cursor
    `).run(developerId, dataType, status, errorMessage ?? null, cursor);
  } else {
    db.prepare(`
      INSERT INTO sync_log (developer_id, data_type, last_synced_at, status, error_message, last_cursor)
      VALUES (?, ?, datetime('now'), ?, ?, NULL)
      ON CONFLICT(developer_id, data_type) DO UPDATE SET
        last_synced_at = datetime('now'), status = excluded.status,
        error_message = excluded.error_message
    `).run(developerId, dataType, status, errorMessage ?? null);
  }
}
