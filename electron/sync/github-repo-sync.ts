// @ts-nocheck — fetch().json() returns unknown in strict mode
import { getDb } from "../db/index";

const GITHUB_API = "https://api.github.com";
const GITHUB_GRAPHQL = "https://api.github.com/graphql";

/** Maximum PRs per GraphQL batch. 25 PRs × 50 reviews = 1250 nodes, well under the 5000 limit. */
const REVIEWS_BATCH_SIZE = 25;

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

interface RepoKey {
  org: string;
  name: string;
}

function repoPath(repo: RepoKey): string {
  return `${repo.org}/${repo.name}`;
}

function setRepoSyncStatus(
  org: string,
  repo: string,
  dataType: string,
  status: "ok" | "error" | "syncing",
  errorMessage?: string | null,
  cursor?: string | null,
) {
  const db = getDb();
  if (cursor !== undefined) {
    db.prepare(`
      INSERT INTO repo_sync_log (org, repo, data_type, last_synced_at, status, error_message, last_cursor)
      VALUES (?, ?, ?, datetime('now'), ?, ?, ?)
      ON CONFLICT(org, repo, data_type) DO UPDATE SET
        last_synced_at = datetime('now'), status = excluded.status,
        error_message = excluded.error_message, last_cursor = excluded.last_cursor
    `).run(org, repo, dataType, status, errorMessage ?? null, cursor);
  } else {
    db.prepare(`
      INSERT INTO repo_sync_log (org, repo, data_type, last_synced_at, status, error_message, last_cursor)
      VALUES (?, ?, ?, datetime('now'), ?, ?, NULL)
      ON CONFLICT(org, repo, data_type) DO UPDATE SET
        last_synced_at = datetime('now'), status = excluded.status,
        error_message = excluded.error_message
    `).run(org, repo, dataType, status, errorMessage ?? null);
  }
}

/** Returns true if the repo data type was successfully synced within the given age window. */
export function isRepoSyncFresh(org: string, repo: string, dataType: string, maxAgeMs: number): boolean {
  const db = getDb();
  const row = db.prepare(
    "SELECT last_synced_at, status FROM repo_sync_log WHERE org = ? AND repo = ? AND data_type = ?",
  ).get(org, repo, dataType) as { last_synced_at: string; status: string } | undefined;
  if (!row || row.status !== "ok") return false;
  return Date.now() - new Date(row.last_synced_at).getTime() < maxAgeMs;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

interface GraphQLReview {
  id: number;
  reviewer_login: string;
  state: string;
  submitted_at: string;
  url: string | null;
}

/**
 * Batch-fetches PR reviews via GraphQL for up to REVIEWS_BATCH_SIZE PRs per request,
 * replacing the previous N+1 REST pattern (one /pulls/{n}/reviews call per PR).
 */
async function batchFetchPRReviewsGraphQL(
  token: string,
  owner: string,
  repoName: string,
  prNumbers: number[],
): Promise<Map<number, GraphQLReview[]>> {
  const results = new Map<number, GraphQLReview[]>();
  if (prNumbers.length === 0) return results;

  for (const chunk of chunkArray(prNumbers, REVIEWS_BATCH_SIZE)) {
    const fields = chunk
      .map(
        (n) =>
          `    pr_${n}: pullRequest(number: ${n}) {
      reviews(first: 50) { nodes { databaseId state submittedAt url author { login } } }
    }`,
      )
      .join("\n");

    const query = `query { repository(owner: "${owner}", name: "${repoName}") {\n${fields}\n} }`;

    try {
      const res = await fetch(GITHUB_GRAPHQL, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!res.ok) continue;

      const data = await res.json();
      const repoData = data.data?.repository;
      if (!repoData) continue;

      for (const n of chunk) {
        const prData = repoData[`pr_${n}`];
        if (!prData?.reviews?.nodes) continue;
        results.set(
          n,
          prData.reviews.nodes
            .filter((r: any) => r.author?.login && r.databaseId)
            .map((r: any) => ({
              id: r.databaseId,
              reviewer_login: r.author.login,
              state: r.state,
              submitted_at: r.submittedAt || "",
              url: r.url || null,
            })),
        );
      }
    } catch (err) {
      console.error(`[Sync] GraphQL batch reviews error for ${owner}/${repoName}:`, err);
    }
  }

  return results;
}

const ISSUE_URL_RE = /^https:\/\/api\.github\.com\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)$/;

function parseIssueUrl(issueUrl: string): { repoPath: string; number: number } | null {
  const m = issueUrl.match(ISSUE_URL_RE);
  if (!m) return null;
  return { repoPath: `${m[1]}/${m[2]}`, number: parseInt(m[3], 10) };
}

interface ReviewForMetadata {
  pr_number: number;
  reviewer_login: string;
  state: string;
  submitted_at: string;
}

function updateDeveloperPRsWithReviewMetadata(db: ReturnType<typeof getDb>, repo: string, reviews: ReviewForMetadata[]): void {
  // Group reviews by PR number
  const reviewsByPR = new Map<number, ReviewForMetadata[]>();
  for (const r of reviews) {
    if (!reviewsByPR.has(r.pr_number)) {
      reviewsByPR.set(r.pr_number, []);
    }
    reviewsByPR.get(r.pr_number)!.push(r);
  }

  const update = db.prepare(`
    UPDATE cached_pull_requests
    SET review_count = ?,
        latest_review_state = ?,
        first_review_submitted_at = ?
    WHERE repo = ? AND pr_number = ?
  `);

  for (const [prNumber, prReviews] of reviewsByPR) {
    const reviewCount = prReviews.length;
    
    // Determine latest review state (prioritize APPROVED > CHANGES_REQUESTED > COMMENTED)
    let latestState: string | null = null;
    const sortedReviews = [...prReviews].sort((a, b) => 
      b.submitted_at.localeCompare(a.submitted_at)
    );
    for (const r of sortedReviews) {
      if (r.state === "APPROVED") {
        latestState = "APPROVED";
        break;
      } else if (r.state === "CHANGES_REQUESTED" && latestState !== "APPROVED") {
        latestState = "CHANGES_REQUESTED";
      } else if (r.state === "COMMENTED" && !latestState) {
        latestState = "COMMENTED";
      }
    }

    // Find earliest review submission
    const firstReviewSubmittedAt = prReviews
      .map(r => r.submitted_at)
      .filter(Boolean)
      .sort()[0] || null;

    update.run(reviewCount, latestState, firstReviewSubmittedAt, repo, prNumber);
  }
}

// ---------- Repo-level PR Review Comments Sync ----------

export async function syncRepoPRReviewComments(token: string, repo: RepoKey): Promise<void> {
  const db = getDb();
  const rp = repoPath(repo);

  console.log(`[Sync] Starting PR review comments sync for repo: ${rp}`);

  setRepoSyncStatus(repo.org, repo.name, "pr_review_comments", "syncing");

  try {
    const syncLog = db.prepare(
      "SELECT last_cursor FROM repo_sync_log WHERE org = ? AND repo = ? AND data_type = 'pr_review_comments'",
    ).get(repo.org, repo.name) as { last_cursor: string | null } | undefined;

    const since = syncLog?.last_cursor
      ? syncLog.last_cursor
      : (() => {
          const d = new Date();
          d.setDate(d.getDate() - 90);
          return d.toISOString();
        })();

    console.log(`[Sync] Repo ${rp}: Fetching comments since ${since}`);

    let latestCreatedAt = since;

    // Fetch PR review comments (code review comments on specific lines)
    const reviewComments: Array<{
      id: number;
      pr_number: number;
      author_login: string;
      commit_sha: string;
      path: string | null;
      body: string;
      created_at: string;
      url: string;
    }> = [];

    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const url = `${GITHUB_API}/repos/${rp}/pulls/comments?since=${encodeURIComponent(since)}&per_page=100&page=${page}`;
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
        if (!login) continue;

        reviewComments.push({
          id: item.id,
          pr_number: prNumber,
          author_login: login,
          commit_sha: item.commit_id,
          path: item.path,
          body: item.body,
          created_at: item.created_at,
          url: item.html_url,
        });
      }

      hasMore = items.length === 100 && page < 10;
      page++;
    }

    // Fetch issue comments (conversation comments on PRs)
    const issueComments: Array<{
      id: number;
      pr_number: number;
      author_login: string;
      created_at: string;
      url: string;
    }> = [];

    page = 1;
    hasMore = true;
    while (hasMore) {
      const icUrl = `${GITHUB_API}/repos/${rp}/issues/comments?since=${encodeURIComponent(since)}&per_page=100&page=${page}`;
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
        if (!parsed || parsed.repoPath !== rp) continue;
        const login = ic.user?.login;
        if (!login) continue;

        issueComments.push({
          id: ic.id,
          pr_number: parsed.number,
          author_login: login,
          created_at: ic.created_at,
          url: ic.html_url,
        });
      }

      hasMore = icItems.length === 100 && page < 10;
      page++;
    }

    const upsertReviewComment = db.prepare(`
      INSERT OR REPLACE INTO cached_repo_pr_review_comments
        (repo, comment_id, pr_number, author_login, commit_sha, path, body, created_at, url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const upsertIssueComment = db.prepare(`
      INSERT OR REPLACE INTO cached_repo_pr_issue_comments
        (repo, comment_id, pr_number, author_login, created_at, url)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    db.transaction(() => {
      for (const c of reviewComments) {
        upsertReviewComment.run(
          rp,
          c.id,
          c.pr_number,
          c.author_login,
          c.commit_sha,
          c.path ?? null,
          c.body,
          c.created_at,
          c.url,
        );
      }
      for (const c of issueComments) {
        upsertIssueComment.run(rp, c.id, c.pr_number, c.author_login, c.created_at, c.url);
      }
    })();

    console.log(`[Sync] Finished PR review comments sync for repo: ${rp} (${reviewComments.length} review comments, ${issueComments.length} issue comments)`);

    setRepoSyncStatus(repo.org, repo.name, "pr_review_comments", "ok", null, latestCreatedAt);
  } catch (err) {
    console.error(`[Sync] Failed PR review comments sync for repo: ${rp}`, err);
    setRepoSyncStatus(repo.org, repo.name, "pr_review_comments", "error", String(err));
    throw err;
  }
}

// ---------- Repo-level PR Reviews (for approvals) Sync ----------

export async function syncRepoPRReviews(token: string, repo: RepoKey): Promise<void> {
  const db = getDb();
  const rp = repoPath(repo);

  console.log(`[Sync] Starting PR reviews sync for repo: ${rp}`);

  setRepoSyncStatus(repo.org, repo.name, "pr_reviews", "syncing");

  try {
    const syncLog = db.prepare(
      "SELECT last_cursor FROM repo_sync_log WHERE org = ? AND repo = ? AND data_type = 'pr_reviews'",
    ).get(repo.org, repo.name) as { last_cursor: string | null } | undefined;

    let since: string;
    if (syncLog?.last_cursor) {
      since = syncLog.last_cursor;
    } else {
      const d = new Date();
      d.setDate(d.getDate() - 90);
      since = d.toISOString().split("T")[0];
    }

    console.log(`[Sync] Repo ${rp}: Fetching PR reviews since ${since}`);

    const reviews: Array<{
      id: number;
      pr_number: number;
      reviewer_login: string;
      state: string;
      submitted_at: string;
      url: string | null;
    }> = [];

    let latestUpdated = `${since}T00:00:00Z`;

    // Phase 1: Collect all PR numbers updated since cursor (paginated search)
    const allPRItems: Array<{ number: number; updated_at: string }> = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const q = `type:pr repo:${rp} updated:>=${since}`.trim();
      const url = `${GITHUB_API}/search/issues?q=${encodeURIComponent(q)}&per_page=100&page=${page}`;
      const res = await fetch(url, { headers: headers(token) });
      if (!res.ok) break;

      const data = await res.json();
      const items: Array<{ number: number; updated_at: string }> = data.items ?? [];
      if (items.length === 0) break;

      allPRItems.push(...items);
      hasMore = items.length === 100 && page < 10;
      page++;
    }

    for (const item of allPRItems) {
      if (item.updated_at > latestUpdated) latestUpdated = item.updated_at;
    }

    // Phase 2: Batch-fetch reviews via GraphQL (replaces N+1 REST calls)
    const prNumbers = allPRItems.map((item) => item.number);
    const reviewsByPR = await batchFetchPRReviewsGraphQL(token, repo.org, repo.name, prNumbers);

    for (const [prNumber, prReviews] of reviewsByPR) {
      for (const r of prReviews) {
        reviews.push({
          id: r.id,
          pr_number: prNumber,
          reviewer_login: r.reviewer_login,
          state: r.state,
          submitted_at: r.submitted_at,
          url: r.url,
        });
      }
    }

    const upsertReview = db.prepare(`
      INSERT OR REPLACE INTO cached_repo_pr_reviews
        (repo, review_id, pr_number, reviewer_login, state, submitted_at, url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    db.transaction(() => {
      for (const r of reviews) {
        upsertReview.run(rp, r.id, r.pr_number, r.reviewer_login, r.state, r.submitted_at, r.url);
      }

      // Update developer PR records with review metadata from this repo
      // This populates the review_count, latest_review_state, and first_review_submitted_at
      // that were set to default values in syncPullRequests
      updateDeveloperPRsWithReviewMetadata(db, rp, reviews);
    })();

    console.log(`[Sync] Finished PR reviews sync for repo: ${rp} (${reviews.length} reviews)`);

    const cursorOut = latestUpdated.includes("T") ? latestUpdated.split("T")[0] : latestUpdated;
    setRepoSyncStatus(repo.org, repo.name, "pr_reviews", "ok", null, cursorOut);
  } catch (err) {
    console.error(`[Sync] Failed PR reviews sync for repo: ${rp}`, err);
    setRepoSyncStatus(repo.org, repo.name, "pr_reviews", "error", String(err));
    throw err;
  }
}

// ---------- Distribute repo-level cache to developers ----------

export function distributeRepoCommentsToDevs(developerId: string, devGithubUsername: string, repos: RepoKey[]): void {
  const db = getDb();

  console.log(`[Sync] Distributing PR comments from ${repos.length} repo(s) to developer: ${devGithubUsername}`);

  // Get developer's PRs to identify which comments are "received"
  const prRows = db
    .prepare("SELECT repo, pr_number FROM cached_pull_requests WHERE developer_id = ?")
    .all(developerId) as { repo: string; pr_number: number }[];
  const myPRKeys = new Set(prRows.map((r) => `${r.repo}:${r.pr_number}`));

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

  let authoredCount = 0;
  let receivedCount = 0;

  db.transaction(() => {
    for (const repo of repos) {
      const rp = repoPath(repo);

      // Review comments
      const reviewComments = db
        .prepare("SELECT * FROM cached_repo_pr_review_comments WHERE repo = ?")
        .all(rp) as Array<{
          comment_id: number;
          pr_number: number;
          author_login: string;
          commit_sha: string;
          path: string | null;
          body: string;
          created_at: string;
          url: string;
        }>;

      for (const c of reviewComments) {
        if (c.author_login === devGithubUsername) {
          upsertAuthored.run(
            developerId,
            c.comment_id,
            rp,
            c.pr_number,
            c.commit_sha,
            c.path,
            c.body,
            c.created_at,
            c.url,
          );
          authoredCount++;
        } else if (myPRKeys.has(`${rp}:${c.pr_number}`)) {
          upsertReceived.run(
            developerId,
            "pull_review",
            c.comment_id,
            rp,
            c.pr_number,
            c.author_login,
            c.created_at,
            c.url,
          );
          receivedCount++;
        }
      }

      // Issue comments
      const issueComments = db
        .prepare("SELECT * FROM cached_repo_pr_issue_comments WHERE repo = ?")
        .all(rp) as Array<{
          comment_id: number;
          pr_number: number;
          author_login: string;
          created_at: string;
          url: string;
        }>;

      for (const c of issueComments) {
        if (c.author_login === devGithubUsername && myPRKeys.has(`${rp}:${c.pr_number}`)) {
          // Developer commented on their own PR (skip or count as authored? Skip for now)
          continue;
        } else if (c.author_login !== devGithubUsername && myPRKeys.has(`${rp}:${c.pr_number}`)) {
          upsertReceived.run(
            developerId,
            "issue",
            c.comment_id,
            rp,
            c.pr_number,
            c.author_login,
            c.created_at,
            c.url,
          );
          receivedCount++;
        }
      }
    }
  })();

  console.log(`[Sync] Distributed PR comments to ${devGithubUsername}: ${authoredCount} authored, ${receivedCount} received`);
}

export function distributeRepoReviewsToDevs(developerId: string, devGithubUsername: string, repos: RepoKey[]): void {
  const db = getDb();

  console.log(`[Sync] Distributing PR approvals from ${repos.length} repo(s) to developer: ${devGithubUsername}`);

  const upsert = db.prepare(`
    INSERT OR REPLACE INTO cached_pr_approvals_given
      (developer_id, review_id, repo, pr_number, submitted_at, url)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  let approvalsCount = 0;

  db.transaction(() => {
    for (const repo of repos) {
      const rp = repoPath(repo);

      const reviews = db
        .prepare("SELECT * FROM cached_repo_pr_reviews WHERE repo = ? AND state = 'APPROVED'")
        .all(rp) as Array<{
          review_id: number;
          pr_number: number;
          reviewer_login: string;
          submitted_at: string;
          url: string | null;
        }>;

      for (const r of reviews) {
        if (r.reviewer_login === devGithubUsername) {
          upsert.run(developerId, r.review_id, rp, r.pr_number, r.submitted_at, r.url);
          approvalsCount++;
        }
      }
    }
  })();

  console.log(`[Sync] Distributed PR approvals to ${devGithubUsername}: ${approvalsCount} approvals`);
}
