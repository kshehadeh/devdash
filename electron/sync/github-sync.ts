// @ts-nocheck — fetch().json() returns unknown in strict mode
import { getDb } from "../db/index";
import { getConnection, hasUsableToken } from "../db/connections";
import { getDeveloper } from "../db/developers";
import { getSourcesForDeveloper } from "../db/sources";
import {
  fetchContributionCalendar,
  fetchReviewRequests,
  latestReviewStateFromReviews,
  earliestReviewSubmittedAt,
  mergedAtFromSearchIssueItem,
} from "../services/github";

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
  pull_request?: { merged_at: string | null } | null;
  merged_at?: string | null;
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
  let firstReviewSubmittedAt: string | null = null;
  const pendingLogins = (pr.requested_reviewers ?? []).map((r) => r.login);
  let pendingJson = JSON.stringify(pendingLogins);

  try {
    const res = await fetch(`${GITHUB_API}/repos/${repoPath}/pulls/${pr.number}/reviews`, {
      headers: headers(token),
    });
    if (res.ok) {
      const reviews = await res.json();
      if (Array.isArray(reviews)) {
        reviewCount = reviews.length;
        latestState = latestReviewStateFromReviews(reviews);
        firstReviewSubmittedAt = earliestReviewSubmittedAt(reviews);
      }
    }
  } catch {
    /* ignore */
  }

  if (pr.state !== "open") {
    pendingJson = "[]";
  }

  return { pr, repoPath, reviewCount, latestState, pendingJson, firstReviewSubmittedAt };
}

// ---------- Contributions Sync ----------

export async function syncContributions(developerId: string): Promise<void> {
  const db = getDb();
  const dev = getDeveloper(developerId);
  const ghConn = getConnection("github");
  if (!dev?.githubUsername || !hasUsableToken(ghConn)) return;

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
        (developer_id, pr_number, repo, title, status, review_count, created_at, updated_at, merged_at, latest_review_state, pending_reviewers_json, first_review_submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          e.reviewCount,
          pr.created_at,
          pr.updated_at,
          mergedAt,
          e.latestState,
          e.pendingJson,
          e.firstReviewSubmittedAt,
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

// ---------- PR Review Comments Sync ----------

const ISSUE_URL_RE = /^https:\/\/api\.github\.com\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)$/;

function parseIssueUrl(issueUrl: string): { repoPath: string; number: number } | null {
  const m = issueUrl.match(ISSUE_URL_RE);
  if (!m) return null;
  return { repoPath: `${m[1]}/${m[2]}`, number: parseInt(m[3], 10) };
}

export async function syncPRReviewComments(developerId: string): Promise<void> {
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

  if (ghRepos.length === 0) {
    setSyncStatus(developerId, "github_pr_review_comments", "ok");
    return;
  }

  setSyncStatus(developerId, "github_pr_review_comments", "syncing");

  try {
    const syncLog = db.prepare(
      "SELECT last_cursor FROM sync_log WHERE developer_id = ? AND data_type = 'github_pr_review_comments'",
    ).get(developerId) as { last_cursor: string | null } | undefined;

    const since = syncLog?.last_cursor
      ? syncLog.last_cursor
      : (() => {
          const d = new Date();
          d.setDate(d.getDate() - 90);
          return d.toISOString();
        })();

    const prRows = db
      .prepare("SELECT repo, pr_number FROM cached_pull_requests WHERE developer_id = ?")
      .all(developerId) as { repo: string; pr_number: number }[];
    const myPRKeys = new Set(prRows.map((r) => `${r.repo}:${r.pr_number}`));

    type AuthoredRow = {
      id: number;
      commit_id: string;
      path: string | null;
      body: string;
      created_at: string;
      html_url: string;
      repoPath: string;
      prNumber: number;
    };
    type ReceivedRow = {
      source: "pull_review" | "issue";
      comment_id: number;
      repo: string;
      pr_number: number;
      author_login: string | null;
      created_at: string;
      url: string | null;
    };

    const authored: AuthoredRow[] = [];
    const received: ReceivedRow[] = [];
    let latestCreatedAt = since;

    for (const repo of ghRepos) {
      const repoPath = `${repo.org}/${repo.name}`;
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const url = `${GITHUB_API}/repos/${repoPath}/pulls/comments?since=${encodeURIComponent(since)}&per_page=100&page=${page}`;
        const res = await fetch(url, { headers: headers(token) });
        if (!res.ok) break;

        const items = await res.json() as Array<{
          id: number;
          commit_id: string;
          path: string | null;
          body: string;
          created_at: string;
          html_url: string;
          user: { login: string } | null;
          pull_request_url: string;
        }>;

        if (!Array.isArray(items) || items.length === 0) break;

        for (const item of items) {
          const prNumber = parseInt(item.pull_request_url.split("/").pop() ?? "0", 10);
          if (!prNumber) continue;
          if (item.created_at > latestCreatedAt) latestCreatedAt = item.created_at;

          const login = item.user?.login;
          if (login === username) {
            authored.push({
              id: item.id,
              commit_id: item.commit_id,
              path: item.path,
              body: item.body,
              created_at: item.created_at,
              html_url: item.html_url,
              repoPath,
              prNumber,
            });
          } else if (login && myPRKeys.has(`${repoPath}:${prNumber}`)) {
            received.push({
              source: "pull_review",
              comment_id: item.id,
              repo: repoPath,
              pr_number: prNumber,
              author_login: login,
              created_at: item.created_at,
              url: item.html_url,
            });
          }
        }

        hasMore = items.length === 100 && page < 10;
        page++;
      }

      // Conversation comments on issues/PRs in this repository
      page = 1;
      hasMore = true;
      while (hasMore) {
        const icUrl = `${GITHUB_API}/repos/${repoPath}/issues/comments?since=${encodeURIComponent(since)}&per_page=100&page=${page}`;
        const icRes = await fetch(icUrl, { headers: headers(token) });
        if (!icRes.ok) break;

        const icItems = await icRes.json() as Array<{
          id: number;
          issue_url: string;
          created_at: string;
          html_url: string;
          user: { login: string } | null;
        }>;

        if (!Array.isArray(icItems) || icItems.length === 0) break;

        for (const ic of icItems) {
          if (ic.created_at > latestCreatedAt) latestCreatedAt = ic.created_at;
          const parsed = parseIssueUrl(ic.issue_url);
          if (!parsed || parsed.repoPath !== repoPath) continue;
          const login = ic.user?.login;
          if (!login || login === username) continue;
          if (!myPRKeys.has(`${repoPath}:${parsed.number}`)) continue;

          received.push({
            source: "issue",
            comment_id: ic.id,
            repo: repoPath,
            pr_number: parsed.number,
            author_login: login,
            created_at: ic.created_at,
            url: ic.html_url,
          });
        }

        hasMore = icItems.length === 100 && page < 10;
        page++;
      }
    }

    const upsertAuthored = db.prepare(`
      INSERT OR REPLACE INTO cached_pr_review_comments
        (developer_id, comment_id, repo, pr_number, commit_sha, path, body, created_at, url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const upsertReceived = db.prepare(`
      INSERT OR REPLACE INTO cached_pr_comments_received
        (developer_id, source, comment_id, repo, pr_number, author_login, created_at, url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    db.transaction(() => {
      for (const item of authored) {
        upsertAuthored.run(
          developerId,
          item.id,
          item.repoPath,
          item.prNumber,
          item.commit_id,
          item.path ?? null,
          item.body,
          item.created_at,
          item.html_url,
        );
      }
      for (const r of received) {
        upsertReceived.run(
          developerId,
          r.source,
          r.comment_id,
          r.repo,
          r.pr_number,
          r.author_login,
          r.created_at,
          r.url,
        );
      }
    })();

    setSyncStatus(developerId, "github_pr_review_comments", "ok", null, latestCreatedAt);
  } catch (err) {
    setSyncStatus(developerId, "github_pr_review_comments", "error", String(err));
    throw err;
  }
}

// ---------- PR approvals (APPROVED reviews) sync ----------

export async function syncPRApprovalsGiven(developerId: string): Promise<void> {
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

  if (ghRepos.length === 0) {
    setSyncStatus(developerId, "github_pr_approvals_given", "ok");
    return;
  }

  setSyncStatus(developerId, "github_pr_approvals_given", "syncing");

  try {
    const syncLog = db.prepare(
      "SELECT last_cursor FROM sync_log WHERE developer_id = ? AND data_type = 'github_pr_approvals_given'",
    ).get(developerId) as { last_cursor: string | null } | undefined;

    let since: string;
    if (syncLog?.last_cursor) {
      since = syncLog.last_cursor;
    } else {
      const d = new Date();
      d.setDate(d.getDate() - 90);
      since = d.toISOString().split("T")[0];
    }

    type ApprovalRow = {
      review_id: number;
      repo: string;
      pr_number: number;
      submitted_at: string;
      url: string | null;
    };
    const approvals: ApprovalRow[] = [];
    let latestUpdated = `${since}T00:00:00Z`;

    for (const repo of ghRepos) {
      const repoPath = `${repo.org}/${repo.name}`;
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const q = `type:pr reviewed-by:${username} repo:${repoPath} updated:>=${since}`.trim();
        const url = `${GITHUB_API}/search/issues?q=${encodeURIComponent(q)}&per_page=100&page=${page}`;
        const res = await fetch(url, { headers: headers(token) });
        if (!res.ok) break;

        const data = await res.json();
        const items: SearchPRItem[] = data.items ?? [];
        if (items.length === 0) break;

        for (const item of items) {
          if (item.updated_at > latestUpdated) latestUpdated = item.updated_at;

          const repoPathItem = item.repository_url.replace("https://api.github.com/repos/", "");
          try {
            const revRes = await fetch(
              `${GITHUB_API}/repos/${repoPathItem}/pulls/${item.number}/reviews`,
              { headers: headers(token) },
            );
            if (!revRes.ok) continue;
            const reviews = await revRes.json() as Array<{
              id: number;
              state: string;
              submitted_at?: string | null;
              html_url?: string | null;
              user?: { login: string } | null;
            }>;
            if (!Array.isArray(reviews)) continue;
            for (const r of reviews) {
              if (r.user?.login !== username || r.state !== "APPROVED" || r.id == null) continue;
              const submittedAt = r.submitted_at || item.updated_at;
              approvals.push({
                review_id: r.id,
                repo: repoPathItem,
                pr_number: item.number,
                submitted_at: submittedAt,
                url: r.html_url ?? null,
              });
            }
          } catch {
            /* ignore per-PR review fetch errors */
          }
        }

        hasMore = items.length === 100 && page < 10;
        page++;
      }
    }

    const upsert = db.prepare(`
      INSERT OR REPLACE INTO cached_pr_approvals_given
        (developer_id, review_id, repo, pr_number, submitted_at, url)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    db.transaction(() => {
      for (const a of approvals) {
        upsert.run(developerId, a.review_id, a.repo, a.pr_number, a.submitted_at, a.url);
      }
    })();

    const cursorOut = latestUpdated.includes("T") ? latestUpdated.split("T")[0] : latestUpdated;
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
