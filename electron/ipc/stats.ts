import { ipcMain } from "electron";
import { hasUsableToken } from "../db/connections";
import { getStatsContext } from "./stats-context";
import {
  fetchContributionCalendar, fetchPullRequests,
  fetchMergeRatio, fetchVelocity,
} from "../services/github";
import { fetchJiraTickets, fetchCompletedTicketCount, fetchConfluenceDocs, fetchConfluenceActivity } from "../services/atlassian";
import {
  getCachedContributions, getCachedCommitsYTD, getCachedPullRequests,
  hasFreshCache, getSyncStatus,
  computeCachedMergeRatio, computeCachedVelocity, computeCachedReviewTurnaroundHours,
  getCachedJiraTickets, getCachedCompletedTicketCount,
  getCachedConfluencePages, getCachedConfluenceActivity,
  getCachedLinearTicketsAsJiraShape, getCachedLinearCompletedCount,
  countCachedPRReviewCommentsAuthored,
  countCachedPRCommentsReceived,
  countCachedPRApprovalsGiven,
  getCachedMyOpenPRReviewItems,
  getCachedReviewRequestItems,
} from "../db/cache";
import { listDevelopers } from "../db/developers";
import { syncDeveloper } from "../sync/engine";
import type { JiraTicket, CommitDay, PullRequest, ConfluenceDoc, ConfluenceActivity } from "../types";
import type {
  GithubStatsResponse,
  VelocityStatsResponse,
  TicketsStatsResponse,
  ConfluenceStatsResponse,
  PRReviewCommentsResponse,
  TeamOverviewResponse,
} from "../types";

function computeWorkloadHealth(tickets: JiraTicket[]): number {
  const inProgressCount = tickets.filter((t) => t.statusCategory === "in_progress").length;
  const todoCount = tickets.filter((t) => t.statusCategory === "todo").length;
  const openCount = inProgressCount + todoCount;
  if (openCount === 0) return 10;
  const wipPenalty = Math.min(5, Math.max(0, (inProgressCount - 2) * 1.5));
  const volumePenalty = Math.min(5, Math.max(0, (openCount - 8) * 0.5));
  return Math.max(0, Math.round((10 - wipPenalty - volumePenalty) * 10) / 10);
}

async function buildGithubStats(id: string, days: number): Promise<GithubStatsResponse> {
  const ctx = getStatsContext(id, days);
  if (!ctx) {
    return {
      commitHistory: [],
      commitsYTD: 0,
      pullRequests: [],
    };
  }

  if (ctx.integration.code !== "github") {
    return {
      commitHistory: [],
      commitsYTD: 0,
      pullRequests: [],
      providerId: "github",
    };
  }

  const contribCached = hasFreshCache(id, "github_contributions");
  const prCached = hasFreshCache(id, "github_pull_requests");

  if (contribCached && prCached) {
    const commitHistory = getCachedContributions(id) ?? [];
    const commitsYTD = getCachedCommitsYTD(id);
    const pullRequests = getCachedPullRequests(id, days, ctx.repoFilter);
    const sync = getSyncStatus(id, "github_contributions") ?? getSyncStatus(id, "github_pull_requests");
    return {
      commitHistory,
      commitsYTD,
      pullRequests,
      providerId: "github",
      _syncedAt: sync?.lastSyncedAt,
    };
  }

  if (!contribCached || !prCached) {
    syncDeveloper(id, { silent: true }).catch((err) => console.error("[stats:github] Background sync error:", err));
  }

  let commitHistory: CommitDay[] = [];
  let commitsYTD = 0;
  let pullRequests: PullRequest[] = [];

  if (hasUsableToken(ctx.ghConn) && ctx.ghUsername) {
    const prPromise =
      ctx.repoFilter.length > 0
        ? fetchPullRequests(ctx.ghConn.token, ctx.ghUsername, ctx.repoFilter, days)
        : Promise.resolve([]);
    const results = await Promise.allSettled([
      fetchContributionCalendar(ctx.ghConn.token, ctx.ghUsername),
      prPromise,
    ]);
    if (results[0].status === "fulfilled") {
      commitHistory = results[0].value.commits;
      commitsYTD = results[0].value.totalContributions;
    }
    if (results[1].status === "fulfilled") {
      pullRequests = results[1].value;
    }
  }

  return {
    commitHistory,
    commitsYTD,
    pullRequests,
    providerId: "github",
  };
}

async function buildVelocityStats(id: string, days: number): Promise<VelocityStatsResponse> {
  const ctx = getStatsContext(id, days);
  if (!ctx) {
    return { velocity: 0, velocityChange: 0, mergeRatio: 0, reviewTurnaroundHours: 0 };
  }

  if (ctx.integration.code !== "github") {
    return { velocity: 0, velocityChange: 0, mergeRatio: 0, reviewTurnaroundHours: 0, providerId: "github" };
  }

  /** From `cached_pull_requests.first_review_submitted_at` (filled during PR sync). */
  const reviewTurnaroundHours = computeCachedReviewTurnaroundHours(id, days, ctx.repoFilter);

  if (hasFreshCache(id, "github_pull_requests")) {
    const { velocity, velocityChange } = computeCachedVelocity(id, days, ctx.repoFilter);
    const mergeRatio = computeCachedMergeRatio(id, days, ctx.repoFilter);
    const sync = getSyncStatus(id, "github_pull_requests");
    return {
      velocity,
      velocityChange,
      mergeRatio,
      reviewTurnaroundHours,
      providerId: "github",
      _syncedAt: sync?.lastSyncedAt,
    };
  }

  syncDeveloper(id, { silent: true }).catch((err) => console.error("[stats:velocity] Background sync error:", err));
  let velocity = 0;
  let velocityChange = 0;
  let mergeRatio = 0;

  if (hasUsableToken(ctx.ghConn) && ctx.ghUsername && ctx.repoFilter.length > 0) {
    const results = await Promise.allSettled([
      fetchMergeRatio(ctx.ghConn.token, ctx.ghUsername, ctx.repoFilter, days),
      fetchVelocity(ctx.ghConn.token, ctx.ghUsername, ctx.repoFilter, days),
    ]);
    if (results[0].status === "fulfilled") mergeRatio = results[0].value;
    if (results[1].status === "fulfilled") {
      velocity = results[1].value.velocity;
      velocityChange = results[1].value.velocityChange;
    }
  }

  // Live path has no review crawl; still surface turnaround from last cached PR sync if present.
  return { velocity, velocityChange, mergeRatio, reviewTurnaroundHours, providerId: "github" };
}

async function buildTicketsStats(id: string, days: number): Promise<TicketsStatsResponse> {
  const ctx = getStatsContext(id, days);
  if (!ctx) {
    return { jiraTickets: [], workloadHealth: 10, ticketVelocity: 0 };
  }

  if (ctx.integration.work === "jira") {
    if (hasFreshCache(id, "jira_tickets") && ctx.atConn?.org) {
      const jiraTickets = getCachedJiraTickets(id, ctx.atConn.org, days, ctx.projectFilter);
      const ticketVelocity = getCachedCompletedTicketCount(id, days, ctx.projectFilter);
      const syncedAt = getSyncStatus(id, "jira_tickets")?.lastSyncedAt;
      return {
        jiraTickets,
        workloadHealth: computeWorkloadHealth(jiraTickets),
        ticketVelocity,
        providerId: "jira",
        _syncedAt: syncedAt,
      };
    }

    if (ctx.atConn?.connected && ctx.atConn.token && ctx.atConn.email && ctx.atConn.org && ctx.workEmail) {
      syncDeveloper(id, { silent: true }).catch((err) => console.error("[stats:tickets] Background sync error:", err));
    }

    let jiraTickets: JiraTicket[] = [];
    let ticketVelocity = 0;

    if (
      ctx.atConn?.connected &&
      ctx.atConn.token &&
      ctx.atConn.email &&
      ctx.atConn.org &&
      ctx.workEmail &&
      ctx.projectFilter.length > 0
    ) {
      const [t, v] = await Promise.allSettled([
        fetchJiraTickets(ctx.atConn.org, ctx.atConn.email, ctx.atConn.token, ctx.workEmail, ctx.projectFilter, days),
        fetchCompletedTicketCount(ctx.atConn.org, ctx.atConn.email, ctx.atConn.token, ctx.workEmail, ctx.projectFilter, days),
      ]);
      if (t.status === "fulfilled") jiraTickets = t.value;
      if (v.status === "fulfilled") ticketVelocity = v.value;
    }

    return {
      jiraTickets,
      workloadHealth: computeWorkloadHealth(jiraTickets),
      ticketVelocity,
      providerId: "jira",
    };
  }

  if (ctx.integration.work === "linear") {
    if (hasFreshCache(id, "linear_issues")) {
      const jiraTickets = getCachedLinearTicketsAsJiraShape(
        id,
        days,
        ctx.linearTeamFilter,
        ctx.linearConn?.org ?? undefined,
      );
      const ticketVelocity = getCachedLinearCompletedCount(id, days, ctx.linearTeamFilter);
      const syncedAt = getSyncStatus(id, "linear_issues")?.lastSyncedAt;
      return {
        jiraTickets,
        workloadHealth: computeWorkloadHealth(jiraTickets),
        ticketVelocity,
        providerId: "linear",
        _syncedAt: syncedAt,
      };
    }

    if (
      ctx.linearConn?.connected &&
      ctx.linearConn.token &&
      ctx.workEmail &&
      ctx.linearTeamFilter.length > 0
    ) {
      syncDeveloper(id, { silent: true }).catch((err) => console.error("[stats:tickets/linear] Background sync error:", err));
    }

    return {
      jiraTickets: [],
      workloadHealth: 10,
      ticketVelocity: 0,
      providerId: "linear",
    };
  }

  return { jiraTickets: [], workloadHealth: 10, ticketVelocity: 0 };
}

async function buildConfluenceStats(id: string, days: number): Promise<ConfluenceStatsResponse> {
  const ctx = getStatsContext(id, days);
  if (!ctx) {
    return { confluenceDocs: [], confluenceActivity: [], docAuthorityLevel: 1 };
  }

  if (ctx.integration.docs !== "confluence") {
    return {
      confluenceDocs: [],
      confluenceActivity: [],
      docAuthorityLevel: 1,
      providerId: "confluence",
    };
  }

  if (hasFreshCache(id, "confluence_pages")) {
    const confluenceDocs = getCachedConfluencePages(id, ctx.spaceFilter, ctx.atConn?.org ?? undefined) ?? [];
    const confluenceActivity =
      getCachedConfluenceActivity(id, ctx.spaceFilter, ctx.atConn?.org ?? undefined) ?? [];
    const docAuthorityLevel = Math.min(5, Math.max(1, confluenceDocs.length));
    const sync = getSyncStatus(id, "confluence_pages");
    return {
      confluenceDocs,
      confluenceActivity,
      docAuthorityLevel,
      providerId: "confluence",
      _syncedAt: sync?.lastSyncedAt,
    };
  }

  syncDeveloper(id, { silent: true }).catch((err) => console.error("[stats:confluence] Background sync error:", err));
  let confluenceDocs: ConfluenceDoc[] = [];
  let confluenceActivity: ConfluenceActivity[] = [];

  if (
    ctx.atConn?.connected &&
    ctx.atConn.token &&
    ctx.atConn.email &&
    ctx.atConn.org &&
    ctx.workEmail &&
    ctx.spaceFilter.length > 0
  ) {
    const results = await Promise.allSettled([
      fetchConfluenceDocs(ctx.atConn.org, ctx.atConn.email, ctx.atConn.token, ctx.workEmail, ctx.spaceFilter),
      fetchConfluenceActivity(ctx.atConn.org, ctx.atConn.email, ctx.atConn.token, ctx.workEmail, ctx.spaceFilter),
    ]);
    if (results[0].status === "fulfilled") confluenceDocs = results[0].value;
    if (results[1].status === "fulfilled") confluenceActivity = results[1].value;
  }

  return {
    confluenceDocs,
    confluenceActivity,
    docAuthorityLevel: Math.min(5, Math.max(1, confluenceDocs.length)),
    providerId: "confluence",
  };
}

async function buildPRReviewCommentsStats(id: string, days: number): Promise<PRReviewCommentsResponse> {
  const empty: PRReviewCommentsResponse = {
    commentsGiven: 0,
    approvalsGiven: 0,
    commentsReceived: 0,
  };
  const ctx = getStatsContext(id, days);
  if (!ctx || ctx.integration.code !== "github") {
    return empty;
  }

  const repoArg = ctx.repoFilter.length > 0 ? ctx.repoFilter : undefined;
  const commentsGiven = countCachedPRReviewCommentsAuthored(id, days, repoArg);
  const commentsReceived = countCachedPRCommentsReceived(id, days, repoArg);
  const approvalsGiven = countCachedPRApprovalsGiven(id, days, repoArg);

  const syncComments = getSyncStatus(id, "github_pr_review_comments");
  const syncApprovals = getSyncStatus(id, "github_pr_approvals_given");
  return {
    commentsGiven,
    approvalsGiven,
    commentsReceived,
    _syncedAtComments: syncComments?.lastSyncedAt,
    _syncedAtApprovals: syncApprovals?.lastSyncedAt,
  };
}

async function buildTeamOverview(days: number): Promise<TeamOverviewResponse> {
  const developers = listDevelopers();
  const rows: TeamOverviewResponse["rows"] = [];

  for (const d of developers) {
    const ctx = getStatsContext(d.id, days);
    if (!ctx) continue;

    const velocity = await buildVelocityStats(d.id, days);
    const tickets = await buildTicketsStats(d.id, days);

    let openPrCount = 0;
    let pendingReviewCount = 0;
    if (ctx.integration.code === "github") {
      openPrCount = getCachedMyOpenPRReviewItems(d.id, ctx.repoFilter).length;
      pendingReviewCount = getCachedReviewRequestItems(d.id, ctx.repoFilter).length;
    }

    rows.push({
      developerId: d.id,
      name: d.name,
      velocity: velocity.velocity,
      mergeRatio: velocity.mergeRatio,
      reviewTurnaroundHours: velocity.reviewTurnaroundHours,
      workloadHealth: tickets.workloadHealth,
      ticketVelocity: tickets.ticketVelocity,
      openPrCount,
      pendingReviewCount,
    });
  }

  return { days, rows };
}

async function buildWeeklyReportMarkdown(developerId: string, days: number): Promise<string> {
  const gh = await buildGithubStats(developerId, days);
  const velocity = await buildVelocityStats(developerId, days);
  const tickets = await buildTicketsStats(developerId, days);
  const docs = await buildConfluenceStats(developerId, days);
  const comments = await buildPRReviewCommentsStats(developerId, days);

  const merged = gh.pullRequests.filter((p) => p.status === "merged");
  const openPrs = gh.pullRequests.filter((p) => p.status === "open");
  const inProgress = tickets.jiraTickets.filter((t) => t.statusCategory === "in_progress");
  const todo = tickets.jiraTickets.filter((t) => t.statusCategory === "todo");

  const lines: string[] = [];
  lines.push(`# DevDash weekly summary`);
  lines.push("");
  lines.push(`_Lookback: last **${days}** days (generated ${new Date().toISOString().slice(0, 10)})_`);
  lines.push("");
  lines.push("## Highlights");
  lines.push(`- **Velocity:** ${velocity.velocity} PRs opened (Δ ${velocity.velocityChange >= 0 ? "+" : ""}${velocity.velocityChange}% vs prior period)`);
  lines.push(`- **Merge ratio:** ${velocity.mergeRatio}%`);
  lines.push(`- **Review turnaround:** ${velocity.reviewTurnaroundHours > 0 ? `${velocity.reviewTurnaroundHours}h avg to first review` : "—"}`);
  lines.push(`- **Workload health:** ${tickets.workloadHealth}/10`);
  lines.push(`- **Tickets completed (period):** ${tickets.ticketVelocity}`);
  lines.push(
    `- **PR review comments left:** ${comments.commentsGiven} · **Approvals given:** ${comments.approvalsGiven} · **Comments received on your PRs:** ${comments.commentsReceived}`,
  );
  lines.push("");

  lines.push("## Pull requests");
  lines.push(`- Merged in period: **${merged.length}**`);
  for (const p of merged.slice(0, 20)) {
    lines.push(`  - [${p.title}](${p.url}) (${p.repo}#${p.number})`);
  }
  lines.push(`- Still open (sample): **${openPrs.length}** in list`);
  for (const p of openPrs.slice(0, 10)) {
    lines.push(`  - [${p.title}](${p.url})`);
  }
  lines.push("");

  lines.push("## Work tracking");
  lines.push(`- In progress: **${inProgress.length}**`);
  for (const t of inProgress.slice(0, 15)) {
    lines.push(`  - ${t.key}: ${t.title}`);
  }
  lines.push(`- Todo / backlog (in list): **${todo.length}**`);
  lines.push("");

  lines.push("## Documentation");
  lines.push(`- Doc authority level: **${docs.docAuthorityLevel}**`);
  lines.push(`- Recent pages in results: **${docs.confluenceDocs.length}**`);
  for (const d of docs.confluenceDocs.slice(0, 8)) {
    lines.push(`  - ${d.title} (${d.edits} edits)`);
  }
  lines.push("");

  return lines.join("\n");
}

export function registerStatsHandlers() {
  const register = (
    channel: string,
    fn: (id: string, days: number) => Promise<unknown>,
  ) => {
    ipcMain.handle(channel, async (_e, data: { developerId: string; days: number }) => {
      const { developerId: id, days } = data;
      if (!getStatsContext(id, days)) throw new Error("Developer not found");
      return fn(id, days);
    });
  };

  register("stats:github", buildGithubStats);
  register("stats:code", buildGithubStats);
  register("stats:review-comments", buildPRReviewCommentsStats);
  register("stats:velocity", buildVelocityStats);
  register("stats:tickets", buildTicketsStats);
  register("stats:work", buildTicketsStats);
  register("stats:confluence", buildConfluenceStats);
  register("stats:docs", buildConfluenceStats);

  ipcMain.handle("stats:team-overview", async (_e, data: { days: number }) => {
    const days = data.days ?? 30;
    return buildTeamOverview(days);
  });

  ipcMain.handle("stats:weekly-report-markdown", async (_e, data: { developerId: string; days: number }) => {
    const { developerId: id, days } = data;
    if (!getStatsContext(id, days)) throw new Error("Developer not found");
    return buildWeeklyReportMarkdown(id, days);
  });
}
