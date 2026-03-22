// @ts-nocheck — fetch().json() returns unknown in strict mode
import { getDb } from "../db/index";
import { getConnection } from "../db/connections";
import { getDeveloper } from "../db/developers";
import { getSourcesForDeveloper } from "../db/sources";
import { fetchContributionCalendar, fetchReviewRequests, latestReviewStateFromReviews } from "../services/github";

const GITHUB_API = "https://api.github.com";

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
  merged_at: string | null;
  created_at: string;
  updated_at: string;
  repository_url: string;
  requested_reviewers?: { login: string }[];
  review_comments?: number;
  user?: { login: string };
}

async function enrichPullForCache(pr: SearchPRItem, token: string) {
  const repoPath = pr.repository_url.replace("https://api.github.com/repos/", "");
  let reviewCount =
    typeof pr.review_comments === "number"
      ? pr.review_comments
      : (pr.requested_reviewers?.length ?? 0);
  let latestState = null;
  const pendingLogins = (pr.requested_reviewers ?? []).map((r) => r.login);
  let pendingJson = JSON.stringify(pendingLogins);

  if (pr.state === "open") {
    try {
      const res = await fetch(`${GITHUB_API}/repos/${repoPath}/pulls/${pr.number}/reviews`, {
        headers: headers(token),
      });
      if (res.ok) {
        const reviews = await res.json();
        reviewCount = reviews.length;
        latestState = latestReviewStateFromReviews(reviews);
      }
    } catch {
      /* ignore */
    }
  } else {
    pendingJson = "[]";
  }

  return { pr, repoPath, reviewCount, latestState, pendingJson };
}

// ---------- Contributions Sync ----------

export async function syncContributions(developerId: string): Promise<void> {
  const db = getDb();
  const dev = getDeveloper(developerId);
  const ghConn = getConnection("github");
  if (!dev?.githubUsername || !ghConn?.connected || !ghConn.token) return;

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
  if (!dev?.githubUsername || !ghConn?.connected || !ghConn.token) return;

  const token = ghConn.token;
  const username = dev.githubUsername;

  const devSources = getSourcesForDeveloper(developerId);
  const ghRepos = devSources
    .filter((s) => s.type === "github_repo")
    .map((s) => ({ org: s.org, name: s.identifier }));

  const repoFilter = ghRepos.length > 0 ? " " + ghRepos.map((r) => `repo:${r.org}/${r.name}`).join(" ") : "";

  setSyncStatus(developerId, "github_pull_requests", "syncing");

  try {
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
    const q = `type:pr author:${username} updated:>=${since}${repoFilter} sort:updated-asc`;
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

    const reviewQueuePromise = fetchReviewRequests(
      token,
      username,
      ghRepos.length > 0 ? ghRepos : undefined,
      100,
    );

    const incrementalEnriched = await Promise.all(allPRs.map((pr) => enrichPullForCache(pr, token)));

    // Refresh open PR review signals every sync (incremental query can miss idle open PRs)
    const openQ = `type:pr is:open author:${username}${repoFilter} sort:updated-desc`.trim();
    const openUrl = `${GITHUB_API}/search/issues?q=${encodeURIComponent(openQ)}&per_page=30`;
    const openRes = await fetch(openUrl, { headers: headers(token) });
    const openItems: SearchPRItem[] = openRes.ok ? ((await openRes.json()).items ?? []) : [];
    const openEnriched = await Promise.all(openItems.map((pr) => enrichPullForCache(pr, token)));

    const reviewQueue = await reviewQueuePromise;

    const upsert = db.prepare(`
      INSERT OR REPLACE INTO cached_pull_requests
        (developer_id, pr_number, repo, title, status, review_count, created_at, updated_at, merged_at, latest_review_state, pending_reviewers_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertReviewReq = db.prepare(`
      INSERT OR REPLACE INTO cached_review_requests
        (developer_id, repo, pr_number, title, author_login, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    let latestUpdated = since;

    db.transaction(() => {
      const runUpsert = (e: Awaited<ReturnType<typeof enrichPullForCache>>) => {
        const pr = e.pr;
        let status: "open" | "merged" | "closed" = "open";
        if (pr.merged_at) status = "merged";
        else if (pr.state === "closed") status = "closed";

        upsert.run(
          developerId,
          pr.number,
          e.repoPath,
          pr.title,
          status,
          e.reviewCount,
          pr.created_at,
          pr.updated_at,
          pr.merged_at ?? null,
          e.latestState,
          e.pendingJson,
        );

        if (pr.updated_at > latestUpdated) latestUpdated = pr.updated_at;
      };

      for (const e of incrementalEnriched) runUpsert(e);
      for (const e of openEnriched) runUpsert(e);

      db.prepare("DELETE FROM cached_review_requests WHERE developer_id = ?").run(developerId);
      for (const r of reviewQueue) {
        insertReviewReq.run(developerId, r.repo, r.number, r.title, r.authorLogin, r.updatedAt);
      }
    })();

    setSyncStatus(developerId, "github_pull_requests", "ok", null, latestUpdated.split("T")[0]);
  } catch (err) {
    setSyncStatus(developerId, "github_pull_requests", "error", String(err));
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
