import type { CommitDay, PullRequest, DeveloperStats } from "../types";

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
  merged_at: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
  requested_reviewers: { login: string }[];
  review_comments: number;
  repository_url: string;
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
  if (repos !== undefined && repos.length === 0) return [];

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
      if (item.merged_at) status = "merged";
      else if (item.state === "closed") status = "closed";

      allPRs.push({
        id: `pr-${item.number}`,
        title: item.title,
        repo: repoPath,
        number: item.number,
        url: item.html_url,
        status,
        reviewCount: item.review_comments || item.requested_reviewers?.length || 0,
        updatedAt: item.updated_at,
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

export async function fetchMergeRatio(
  token: string,
  username: string,
  repos?: { org: string; name: string }[],
  days = 30,
): Promise<number> {
  if (repos !== undefined && repos.length === 0) return 0;
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
  if (repos !== undefined && repos.length === 0) return { velocity: 0, velocityChange: 0 };
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

const BUG_PATTERNS = /\b(fix|bug|patch|hotfix|issue|error|crash|broken)\b/i;
const REVIEW_PATTERNS = /\b(review|refactor|cleanup|lint|style|format|rename|chore|ci|test)\b/i;

export function classifyEffortDistribution(
  prs: PullRequest[],
): DeveloperStats["effortDistribution"] {
  if (prs.length === 0) return { feature: 34, bugFix: 33, codeReview: 33 };

  let bugFix = 0;
  let feature = 0;

  for (const pr of prs) {
    const title = pr.title.toLowerCase();
    if (BUG_PATTERNS.test(title)) {
      bugFix++;
    } else if (!REVIEW_PATTERNS.test(title)) {
      feature++;
    }
  }

  const total = prs.length;
  const featurePct = Math.round((feature / total) * 100);
  const bugFixPct = Math.round((bugFix / total) * 100);
  return {
    feature: featurePct,
    bugFix: bugFixPct,
    codeReview: Math.max(0, 100 - featurePct - bugFixPct),
  };
}
