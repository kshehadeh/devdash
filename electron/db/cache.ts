import { getDb } from "./index";
import type {
  CommitDay,
  PullRequest,
  ConfluenceDoc,
  JiraTicket,
  MyPRReviewItem,
  PullReviewState,
  ReviewRequestItem,
} from "../types";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

// ---------- Sync Status ----------

export interface SyncStatusEntry {
  lastSyncedAt: string;
  status: "ok" | "error" | "syncing";
  errorMessage: string | null;
}

export function getSyncStatus(devId: string, dataType: string): SyncStatusEntry | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT last_synced_at, status, error_message FROM sync_log WHERE developer_id = ? AND data_type = ?",
  ).get(devId, dataType) as { last_synced_at: string; status: string; error_message: string | null } | undefined;
  if (!row) return null;
  return { lastSyncedAt: row.last_synced_at, status: row.status as SyncStatusEntry["status"], errorMessage: row.error_message };
}

export function getAllSyncStatuses(devId: string): Record<string, SyncStatusEntry> {
  const db = getDb();
  const rows = db.prepare(
    "SELECT data_type, last_synced_at, status, error_message FROM sync_log WHERE developer_id = ?",
  ).all(devId) as { data_type: string; last_synced_at: string; status: string; error_message: string | null }[];

  const result: Record<string, SyncStatusEntry> = {};
  for (const row of rows) {
    result[row.data_type] = {
      lastSyncedAt: row.last_synced_at,
      status: row.status as SyncStatusEntry["status"],
      errorMessage: row.error_message,
    };
  }
  return result;
}

export function hasFreshCache(devId: string, dataType: string): boolean {
  const status = getSyncStatus(devId, dataType);
  return status !== null && status.status === "ok";
}

// ---------- Contributions ----------

export function getCachedContributions(devId: string): CommitDay[] | null {
  if (!hasFreshCache(devId, "github_contributions")) return null;
  const db = getDb();
  const rows = db.prepare(
    "SELECT date, count FROM cached_contributions WHERE developer_id = ? ORDER BY date ASC",
  ).all(devId) as { date: string; count: number }[];
  return rows;
}

export function getCachedCommitsYTD(devId: string): number {
  const db = getDb();
  const yearStart = new Date().getFullYear() + "-01-01";
  const row = db.prepare(
    "SELECT COALESCE(SUM(count), 0) as total FROM cached_contributions WHERE developer_id = ? AND date >= ?",
  ).get(devId, yearStart) as { total: number };
  return row.total;
}

// ---------- Pull Requests ----------

function repoClause(repos: { org: string; name: string }[] | undefined): { sql: string; values: string[] } {
  // undefined = no developer scoping (legacy); [] = developer has no GitHub repos assigned → no rows
  if (repos === undefined) return { sql: "", values: [] };
  if (repos.length === 0) return { sql: " AND 1=0", values: [] };
  const values = repos.map((r) => `${r.org}/${r.name}`);
  return { sql: ` AND repo IN (${values.map(() => "?").join(",")})`, values };
}

function projectClause(projectKeys: string[] | undefined): { sql: string; values: string[] } {
  if (projectKeys === undefined) return { sql: "", values: [] };
  if (projectKeys.length === 0) return { sql: " AND 1=0", values: [] };
  return { sql: ` AND project_key IN (${projectKeys.map(() => "?").join(",")})`, values: projectKeys };
}

function spaceClause(spaceKeys: string[] | undefined): { sql: string; values: string[] } {
  if (spaceKeys === undefined) return { sql: "", values: [] };
  if (spaceKeys.length === 0) return { sql: " AND 1=0", values: [] };
  return { sql: ` AND space_key IN (${spaceKeys.map(() => "?").join(",")})`, values: spaceKeys };
}

export function getCachedPullRequests(devId: string, days: number, repos?: { org: string; name: string }[]): PullRequest[] {
  const db = getDb();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString();
  const { sql: repoSql, values: repoValues } = repoClause(repos);

  const rows = db.prepare(`
    SELECT pr_number, repo, title, status, review_count, created_at, updated_at
    FROM cached_pull_requests
    WHERE developer_id = ? AND created_at >= ?${repoSql}
    ORDER BY updated_at DESC
    LIMIT 15
  `).all(devId, sinceStr, ...repoValues) as {
    pr_number: number; repo: string; title: string; status: string;
    review_count: number; created_at: string; updated_at: string;
  }[];

  return rows.map((row) => ({
    id: `pr-${row.pr_number}`,
    title: row.title,
    repo: row.repo,
    number: row.pr_number,
    url: `https://github.com/${row.repo}/pull/${row.pr_number}`,
    status: row.status as PullRequest["status"],
    reviewCount: row.review_count,
    updatedAt: row.updated_at,
    timeAgo: timeAgo(row.updated_at),
    isActive: row.status === "open",
  }));
}

export function computeCachedMergeRatio(devId: string, days: number, repos?: { org: string; name: string }[]): number {
  if (repos && repos.length === 0) return 0;

  const db = getDb();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString();
  const { sql: repoSql, values: repoValues } = repoClause(repos);

  const total = db.prepare(
    `SELECT COUNT(*) as c FROM cached_pull_requests WHERE developer_id = ? AND created_at >= ?${repoSql}`,
  ).get(devId, sinceStr, ...repoValues) as { c: number };

  if (total.c === 0) return 100;

  const merged = db.prepare(
    `SELECT COUNT(*) as c FROM cached_pull_requests WHERE developer_id = ? AND created_at >= ? AND status = 'merged'${repoSql}`,
  ).get(devId, sinceStr, ...repoValues) as { c: number };

  return Math.round((merged.c / total.c) * 100);
}

export function computeCachedVelocity(devId: string, days: number, repos?: { org: string; name: string }[]): { velocity: number; velocityChange: number } {
  if (repos && repos.length === 0) return { velocity: 0, velocityChange: 0 };

  const db = getDb();
  const now = new Date();
  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - days);
  const prevPeriodStart = new Date(now);
  prevPeriodStart.setDate(prevPeriodStart.getDate() - days * 2);
  const { sql: repoSql, values: repoValues } = repoClause(repos);

  const recent = db.prepare(
    `SELECT COUNT(*) as c FROM cached_pull_requests WHERE developer_id = ? AND created_at >= ? AND created_at < ?${repoSql}`,
  ).get(devId, periodStart.toISOString(), now.toISOString(), ...repoValues) as { c: number };

  const prev = db.prepare(
    `SELECT COUNT(*) as c FROM cached_pull_requests WHERE developer_id = ? AND created_at >= ? AND created_at < ?${repoSql}`,
  ).get(devId, prevPeriodStart.toISOString(), periodStart.toISOString(), ...repoValues) as { c: number };

  const velocity = recent.c;
  const velocityChange = prev.c > 0
    ? Math.round(((recent.c - prev.c) / prev.c) * 100)
    : 0;

  return { velocity, velocityChange };
}

function parseCachedLatestReviewState(raw: string | null): PullReviewState {
  if (!raw) return null;
  if (raw === "APPROVED" || raw === "CHANGES_REQUESTED" || raw === "COMMENTED") return raw;
  return null;
}

/** Review queue from last successful `github_pull_requests` sync (direct user requests only). */
export function getCachedReviewRequestItems(
  devId: string,
  repos?: { org: string; name: string }[],
): ReviewRequestItem[] {
  const db = getDb();
  const { sql: repoSql, values: repoValues } = repoClause(repos);
  const rows = db.prepare(`
    SELECT repo, pr_number, title, author_login, updated_at
    FROM cached_review_requests
    WHERE developer_id = ?${repoSql}
    ORDER BY updated_at DESC
    LIMIT 100
  `).all(devId, ...repoValues) as {
    repo: string;
    pr_number: number;
    title: string;
    author_login: string;
    updated_at: string;
  }[];

  return rows.map((row) => ({
    id: `rr-${row.repo.replace(/\//g, "-")}-${row.pr_number}`,
    title: row.title,
    repo: row.repo,
    number: row.pr_number,
    url: `https://github.com/${row.repo}/pull/${row.pr_number}`,
    authorLogin: row.author_login,
    updatedAt: row.updated_at,
    timeAgo: timeAgo(row.updated_at),
  }));
}

/** Open PRs you authored with review fields from cache. */
export function getCachedMyOpenPRReviewItems(
  devId: string,
  repos?: { org: string; name: string }[],
): MyPRReviewItem[] {
  const db = getDb();
  const { sql: repoSql, values: repoValues } = repoClause(repos);
  const rows = db.prepare(`
    SELECT pr_number, repo, title, review_count, updated_at, latest_review_state, pending_reviewers_json
    FROM cached_pull_requests
    WHERE developer_id = ? AND status = 'open'${repoSql}
    ORDER BY updated_at DESC
    LIMIT 20
  `).all(devId, ...repoValues) as {
    pr_number: number;
    repo: string;
    title: string;
    review_count: number;
    updated_at: string;
    latest_review_state: string | null;
    pending_reviewers_json: string | null;
  }[];

  return rows.map((row) => {
    let pending: string[] = [];
    try {
      const parsed = row.pending_reviewers_json ? JSON.parse(row.pending_reviewers_json) : [];
      pending = Array.isArray(parsed) ? parsed.filter((p: unknown) => typeof p === "string") : [];
    } catch {
      pending = [];
    }

    return {
      id: `my-${row.repo.replace(/\//g, "-")}-${row.pr_number}`,
      title: row.title,
      repo: row.repo,
      number: row.pr_number,
      url: `https://github.com/${row.repo}/pull/${row.pr_number}`,
      status: "open" as const,
      updatedAt: row.updated_at,
      timeAgo: timeAgo(row.updated_at),
      reviewCount: row.review_count,
      latestReviewState: parseCachedLatestReviewState(row.latest_review_state),
      pendingReviewerLogins: pending,
    };
  });
}

// ---------- Jira Tickets ----------

export function getCachedJiraTickets(devId: string, site: string, days: number, projectKeys?: string[]): JiraTicket[] {
  const db = getDb();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString();
  const { sql: projSql, values: projValues } = projectClause(projectKeys);

  const rows = db.prepare(`
    SELECT issue_key, summary, status, status_category, priority, issue_type, project_key, updated_at
    FROM cached_jira_tickets
    WHERE developer_id = ? AND status_category != 'done' AND updated_at >= ?${projSql}
    ORDER BY updated_at DESC
    LIMIT 50
  `).all(devId, sinceStr, ...projValues) as {
    issue_key: string;
    summary: string;
    status: string;
    status_category: string;
    priority: string;
    issue_type: string;
    project_key: string | null;
    updated_at: string;
  }[];

  return rows.map((row) => ({
    id: row.issue_key,
    key: row.issue_key,
    title: row.summary,
    status: row.status,
    statusCategory: row.status_category as "todo" | "in_progress" | "done",
    priority: row.priority as JiraTicket["priority"],
    type: row.issue_type,
    updatedAt: row.updated_at,
    updatedAgo: timeAgo(row.updated_at),
    url: `https://${site}.atlassian.net/browse/${row.issue_key}`,
  }));
}

export function getCachedCompletedTicketCount(devId: string, days: number, projectKeys?: string[]): number {
  const db = getDb();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString();
  const { sql: projSql, values: projValues } = projectClause(projectKeys);

  const row = db.prepare(
    `SELECT COUNT(*) as c FROM cached_jira_tickets WHERE developer_id = ? AND status_category = 'done' AND updated_at >= ?${projSql}`,
  ).get(devId, sinceStr, ...projValues) as { c: number };

  return row.c;
}

// ---------- Confluence ----------

export function getCachedConfluencePages(devId: string, spaceKeys?: string[], site?: string): ConfluenceDoc[] | null {
  if (!hasFreshCache(devId, "confluence_pages")) return null;
  const db = getDb();
  const { sql: spaceSql, values: spaceValues } = spaceClause(spaceKeys);
  const rows = db.prepare(
    `SELECT title, view_count, version_count, page_id, space_key FROM cached_confluence_pages WHERE developer_id = ?${spaceSql} ORDER BY last_modified DESC LIMIT 10`,
  ).all(devId, ...spaceValues) as { title: string; view_count: number; version_count: number; page_id: string; space_key: string }[];

  return rows.map((row) => ({
    title: row.title,
    reads: row.view_count,
    edits: row.version_count,
    url: site && row.space_key
      ? `https://${site}.atlassian.net/wiki/spaces/${row.space_key}/pages/${row.page_id}`
      : undefined,
  }));
}

export function getCachedConfluenceActivity(devId: string, spaceKeys?: string[], site?: string): { type: "edit"; description: string; timeAgo: string; url?: string }[] | null {
  if (!hasFreshCache(devId, "confluence_pages")) return null;
  const db = getDb();
  const { sql: spaceSql, values: spaceValues } = spaceClause(spaceKeys);
  const rows = db.prepare(
    `SELECT title, last_modified, page_id, space_key FROM cached_confluence_pages WHERE developer_id = ?${spaceSql} ORDER BY last_modified DESC LIMIT 5`,
  ).all(devId, ...spaceValues) as { title: string; last_modified: string; page_id: string; space_key: string }[];

  return rows.map((row) => ({
    type: "edit" as const,
    description: `Updated ${row.title}`,
    timeAgo: timeAgo(row.last_modified),
    url: site && row.space_key
      ? `https://${site}.atlassian.net/wiki/spaces/${row.space_key}/pages/${row.page_id}`
      : undefined,
  }));
}
