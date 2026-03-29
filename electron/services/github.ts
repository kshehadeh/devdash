// @ts-nocheck — copied from lib/services, fetch().json() returns unknown in strict mode
import type {
  CommitDay,
  PullRequest,
  MyPRReviewItem,
  PullReviewState,
  ReviewRequestItem,
} from "../types";

const GITHUB_API = "https://api.github.com";
const GITHUB_GRAPHQL = "https://api.github.com/graphql";

interface GraphQLContributionDay {
  contributionCount: number;
  date: string;
}

interface GraphQLWeek {
  contributionDays: GraphQLContributionDay[];
}

interface ContributionCalendarResponse {
  data: {
    user: {
      contributionsCollection: {
        contributionCalendar: {
          totalContributions: number;
          weeks: GraphQLWeek[];
        };
      };
    };
  };
}

interface GitHubPR {
  number: number;
  title: string;
  state: string;
  /** Search `/search/issues` usually nests merge time here, not on the root. */
  pull_request?: { merged_at: string | null } | null;
  merged_at?: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
  requested_reviewers: { login: string }[];
  review_comments: number;
  repository_url: string;
  user?: { login: string };
}

/** GitHub issue-search items expose `merged_at` on `pull_request`, not always at root. */
export function mergedAtFromSearchIssueItem(item: {
  merged_at?: string | null;
  pull_request?: { merged_at: string | null } | null;
}): string | null {
  return item.merged_at ?? item.pull_request?.merged_at ?? null;
}

interface SearchPRResponse {
  total_count: number;
  items: GitHubPR[];
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

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

/** Space-separated `repo:org/name` qualifiers for GitHub issue search (max ~20 results per call). */
function repoQuerySuffix(repos?: { org: string; name: string }[]): string {
  if (!repos || repos.length === 0) return "";
  return " " + repos.map((r) => `repo:${r.org}/${r.name}`).join(" ");
}

const MEANINGFUL_REVIEW_STATES = new Set(["APPROVED", "CHANGES_REQUESTED", "COMMENTED"]);

/** Shared by sync (cache) and live fetchers. */
export function latestReviewStateFromReviews(reviews: { state: string }[]): PullReviewState {
  for (let i = reviews.length - 1; i >= 0; i--) {
    const s = reviews[i].state;
    if (MEANINGFUL_REVIEW_STATES.has(s)) return s as PullReviewState;
  }
  return null;
}

/** Earliest `submitted_at` among reviews (GitHub PR reviews API). */
export function earliestReviewSubmittedAt(reviews: { submitted_at?: string }[]): string | null {
  let minMs: number | null = null;
  for (const r of reviews) {
    const raw = r.submitted_at;
    if (typeof raw !== "string") continue;
    const t = new Date(raw).getTime();
    if (Number.isNaN(t)) continue;
    if (minMs === null || t < minMs) minMs = t;
  }
  return minMs != null ? new Date(minMs).toISOString() : null;
}

/**
 * Open PRs where the user was asked to review directly (excluding PRs they authored).
 * Uses `user-review-requested:` so team-only requests (where the user is only covered via
 * `review-requested:` / membership in a requested team) are omitted — see GitHub search docs.
 */
export async function fetchReviewRequests(
  token: string,
  username: string,
  repos?: { org: string; name: string }[],
  limit = 20,
): Promise<ReviewRequestItem[]> {
  if (repos && repos.length === 0) return [];

  const repo = repoQuerySuffix(repos);
  const q = `type:pr is:open user-review-requested:${username} -author:${username}${repo} sort:updated-desc`.trim();
  const url = `${GITHUB_API}/search/issues?q=${encodeURIComponent(q)}&per_page=${Math.min(limit, 100)}`;
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) return [];

  const data: SearchPRResponse = await res.json();
  const items = data.items ?? [];

  return items.slice(0, limit).map((item) => {
    const repoPath = item.repository_url.replace("https://api.github.com/repos/", "");
    return {
      id: `rr-${repoPath.replace(/\//g, "-")}-${item.number}`,
      title: item.title,
      repo: repoPath,
      number: item.number,
      url: item.html_url,
      authorLogin: item.user?.login ?? "unknown",
      updatedAt: item.updated_at,
      timeAgo: timeAgo(item.updated_at),
    };
  });
}

/** Open PRs the user authored, with review counts, latest review outcome, and pending reviewers. */
export async function fetchMyOpenPRsWithReviewSignals(
  token: string,
  username: string,
  repos?: { org: string; name: string }[],
  limit = 20,
): Promise<MyPRReviewItem[]> {
  if (repos && repos.length === 0) return [];

  const repo = repoQuerySuffix(repos);
  const q = `type:pr is:open author:${username}${repo} sort:updated-desc`.trim();
  const url = `${GITHUB_API}/search/issues?q=${encodeURIComponent(q)}&per_page=${Math.min(limit, 100)}`;
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) return [];

  const data: SearchPRResponse = await res.json();
  const items = (data.items ?? []).slice(0, limit);

  return Promise.all(
    items.map(async (item) => {
      const repoPath = item.repository_url.replace("https://api.github.com/repos/", "");
      let reviewCount = 0;
      let latestReviewState: PullReviewState = null;
      try {
        const revRes = await fetch(
          `${GITHUB_API}/repos/${repoPath}/pulls/${item.number}/reviews`,
          { headers: headers(token) },
        );
        if (revRes.ok) {
          const reviews: { state: string }[] = await revRes.json();
          reviewCount = reviews.length;
          latestReviewState = latestReviewStateFromReviews(reviews);
        }
      } catch {
        /* ignore */
      }

      return {
        id: `my-${repoPath.replace(/\//g, "-")}-${item.number}`,
        title: item.title,
        repo: repoPath,
        number: item.number,
        url: item.html_url,
        status: "open" as const,
        updatedAt: item.updated_at,
        timeAgo: timeAgo(item.updated_at),
        reviewCount,
        latestReviewState,
        pendingReviewerLogins: (item.requested_reviewers ?? []).map((r) => r.login),
      };
    }),
  );
}

export async function fetchContributionCalendar(
  token: string,
  username: string,
): Promise<{ commits: CommitDay[]; totalContributions: number }> {
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const query = `
    query($username: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $username) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
                date
              }
            }
          }
        }
      }
    }
  `;

  const res = await fetch(GITHUB_GRAPHQL, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({
      query,
      variables: {
        username,
        from: oneYearAgo.toISOString(),
        to: now.toISOString(),
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub GraphQL error ${res.status}: ${text}`);
  }

  const json: ContributionCalendarResponse = await res.json();
  const calendar = json.data.user.contributionsCollection.contributionCalendar;

  const commits: CommitDay[] = calendar.weeks.flatMap((week) =>
    week.contributionDays.map((day) => ({
      date: day.date,
      count: day.contributionCount,
    })),
  );

  return { commits, totalContributions: calendar.totalContributions };
}

export async function fetchPullRequests(
  token: string,
  username: string,
  repos?: { org: string; name: string }[],
  days?: number,
): Promise<PullRequest[]> {
  if (repos && repos.length === 0) return [];

  const repoFilter = repos && repos.length > 0
    ? repos.map((r) => `repo:${r.org}/${r.name}`).join(" ")
    : "";

  let dateFilter = "";
  if (days) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    dateFilter = ` created:>=${since.toISOString().split("T")[0]}`;
  }

  const queries = [
    `type:pr author:${username} is:open ${repoFilter}${dateFilter} sort:updated-desc`.trim(),
    `type:pr author:${username} is:merged ${repoFilter}${dateFilter} sort:updated-desc`.trim(),
    `type:pr author:${username} is:closed is:unmerged ${repoFilter}${dateFilter} sort:updated-desc`.trim(),
  ];

  const allPRs: PullRequest[] = [];

  for (const q of queries) {
    const url = `${GITHUB_API}/search/issues?q=${encodeURIComponent(q)}&per_page=10`;
    const res = await fetch(url, { headers: headers(token) });
    if (!res.ok) continue;

    const data: SearchPRResponse = await res.json();
    for (const item of data.items) {
      const repoPath = item.repository_url.replace("https://api.github.com/repos/", "");
      let status: "open" | "merged" | "closed" = "open";
      if (mergedAtFromSearchIssueItem(item)) status = "merged";
      else if (item.state === "closed") status = "closed";

      allPRs.push({
        id: `pr-${item.number}`,
        title: item.title,
        repo: repoPath,
        number: item.number,
        url: item.html_url,
        status,
        reviewCount: item.review_comments || item.requested_reviewers?.length || 0,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        mergedAt: mergedAtFromSearchIssueItem(item),
        firstReviewSubmittedAt: null,
        timeAgo: timeAgo(item.updated_at),
        isActive: status === "open",
      });
    }
  }

  // Deduplicate and sort by most recent
  const seen = new Set<number>();
  const deduplicated = allPRs.filter((pr) => {
    if (seen.has(pr.number)) return false;
    seen.add(pr.number);
    return true;
  }).slice(0, 15);

  // Fetch real review counts for open PRs (most useful for display)
  const withReviews = await Promise.all(
    deduplicated.map(async (pr) => {
      if (pr.status !== "open") return pr;
      try {
        const res = await fetch(
          `${GITHUB_API}/repos/${pr.repo}/pulls/${pr.number}/reviews`,
          { headers: headers(token) },
        );
        if (res.ok) {
          const reviews: { state: string }[] = await res.json();
          return { ...pr, reviewCount: reviews.length };
        }
      } catch { /* ignore */ }
      return pr;
    }),
  );

  return withReviews;
}

const OPEN_AUTHORED_PR_SEARCH_LIMIT = 100;

/** Open PRs authored by the user in assigned repos (no created-date filter). */
export async function fetchOpenAuthoredPullRequests(
  token: string,
  username: string,
  repos?: { org: string; name: string }[],
): Promise<PullRequest[]> {
  if (repos && repos.length === 0) return [];

  const repoFilter =
    repos && repos.length > 0 ? repos.map((r) => `repo:${r.org}/${r.name}`).join(" ") : "";

  const q = `type:pr author:${username} is:open ${repoFilter} sort:updated-desc`.trim();
  const url = `${GITHUB_API}/search/issues?q=${encodeURIComponent(q)}&per_page=${OPEN_AUTHORED_PR_SEARCH_LIMIT}`;
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) return [];

  const data: SearchPRResponse = await res.json();
  const prs: PullRequest[] = (data.items ?? []).map((item) => {
    const repoPath = item.repository_url.replace("https://api.github.com/repos/", "");
    return {
      id: `pr-${item.number}`,
      title: item.title,
      repo: repoPath,
      number: item.number,
      url: item.html_url,
      status: "open" as const,
      reviewCount: item.review_comments || item.requested_reviewers?.length || 0,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      mergedAt: null,
      firstReviewSubmittedAt: null,
      timeAgo: timeAgo(item.updated_at),
      isActive: true,
    };
  });

  const withReviews = await Promise.all(
    prs.map(async (pr) => {
      try {
        const r = await fetch(`${GITHUB_API}/repos/${pr.repo}/pulls/${pr.number}/reviews`, {
          headers: headers(token),
        });
        if (r.ok) {
          const reviews: { state: string }[] = await r.json();
          return { ...pr, reviewCount: reviews.length };
        }
      } catch {
        /* ignore */
      }
      return pr;
    }),
  );

  return withReviews;
}

export async function fetchMergeRatio(
  token: string,
  username: string,
  repos?: { org: string; name: string }[],
  days = 30,
): Promise<number> {
  if (repos && repos.length === 0) return 0;

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);
  const since = sinceDate.toISOString().split("T")[0];
  const repoFilter = repos && repos.length > 0
    ? " " + repos.map((r) => `repo:${r.org}/${r.name}`).join(" ")
    : "";

  const mergedUrl = `${GITHUB_API}/search/issues?q=${encodeURIComponent(`type:pr author:${username} is:merged created:>=${since}${repoFilter}`)}&per_page=1`;
  const totalUrl = `${GITHUB_API}/search/issues?q=${encodeURIComponent(`type:pr author:${username} created:>=${since}${repoFilter}`)}&per_page=1`;

  const [mergedRes, totalRes] = await Promise.all([
    fetch(mergedUrl, { headers: headers(token) }),
    fetch(totalUrl, { headers: headers(token) }),
  ]);

  if (!mergedRes.ok || !totalRes.ok) return 0;

  const merged: SearchPRResponse = await mergedRes.json();
  const total: SearchPRResponse = await totalRes.json();

  if (total.total_count === 0) return 100;
  return Math.round((merged.total_count / total.total_count) * 100);
}

export async function fetchVelocity(
  token: string,
  username: string,
  repos?: { org: string; name: string }[],
  days = 28,
): Promise<{ velocity: number; velocityChange: number }> {
  if (repos && repos.length === 0) return { velocity: 0, velocityChange: 0 };

  const now = new Date();
  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - days);
  const prevPeriodStart = new Date(now);
  prevPeriodStart.setDate(prevPeriodStart.getDate() - days * 2);
  const fourWeeksAgo = periodStart;
  const eightWeeksAgo = prevPeriodStart;
  const repoFilter = repos && repos.length > 0
    ? " " + repos.map((r) => `repo:${r.org}/${r.name}`).join(" ")
    : "";

  const recentQ = `type:pr author:${username} created:${fourWeeksAgo.toISOString().split("T")[0]}..${now.toISOString().split("T")[0]}${repoFilter}`;
  const prevQ = `type:pr author:${username} created:${eightWeeksAgo.toISOString().split("T")[0]}..${fourWeeksAgo.toISOString().split("T")[0]}${repoFilter}`;

  const [recentRes, prevRes] = await Promise.all([
    fetch(`${GITHUB_API}/search/issues?q=${encodeURIComponent(recentQ)}&per_page=1`, { headers: headers(token) }),
    fetch(`${GITHUB_API}/search/issues?q=${encodeURIComponent(prevQ)}&per_page=1`, { headers: headers(token) }),
  ]);

  const recent: SearchPRResponse = recentRes.ok ? await recentRes.json() : { total_count: 0, items: [] };
  const prev: SearchPRResponse = prevRes.ok ? await prevRes.json() : { total_count: 0, items: [] };

  const velocity = recent.total_count;
  const velocityChange = prev.total_count > 0
    ? Math.round(((recent.total_count - prev.total_count) / prev.total_count) * 100)
    : 0;

  return { velocity, velocityChange };
}

