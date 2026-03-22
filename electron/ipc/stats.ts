import { ipcMain } from "electron";
import { getStatsContext } from "./stats-context";
import {
  fetchContributionCalendar, fetchPullRequests, classifyEffortDistribution,
  fetchMergeRatio, fetchVelocity,
} from "../services/github";
import { fetchJiraTickets, fetchCompletedTicketCount, fetchConfluenceDocs, fetchConfluenceActivity } from "../services/atlassian";
import {
  getCachedContributions, getCachedCommitsYTD, getCachedPullRequests,
  hasFreshCache, getSyncStatus,
  computeCachedMergeRatio, computeCachedVelocity,
  getCachedJiraTickets, getCachedCompletedTicketCount,
  getCachedConfluencePages, getCachedConfluenceActivity,
} from "../db/cache";
import { syncDeveloper } from "../sync/engine";
import type { JiraTicket, CommitDay, PullRequest, ConfluenceDoc, ConfluenceActivity } from "../types";

function computeWorkloadHealth(tickets: JiraTicket[]): number {
  const inProgressCount = tickets.filter((t) => t.statusCategory === "in_progress").length;
  const todoCount = tickets.filter((t) => t.statusCategory === "todo").length;
  const openCount = inProgressCount + todoCount;
  if (openCount === 0) return 10;
  const wipPenalty = Math.min(5, Math.max(0, (inProgressCount - 2) * 1.5));
  const volumePenalty = Math.min(5, Math.max(0, (openCount - 8) * 0.5));
  return Math.max(0, Math.round((10 - wipPenalty - volumePenalty) * 10) / 10);
}

export function registerStatsHandlers() {
  ipcMain.handle("stats:github", async (_e, data: { developerId: string; days: number }) => {
    const { developerId: id, days } = data;
    const ctx = getStatsContext(id, days);
    if (!ctx) throw new Error("Developer not found");

    const contribCached = hasFreshCache(id, "github_contributions");
    const prCached = hasFreshCache(id, "github_pull_requests");

    if (contribCached && prCached) {
      const commitHistory = getCachedContributions(id) ?? [];
      const commitsYTD = getCachedCommitsYTD(id);
      const pullRequests = getCachedPullRequests(id, days, ctx.repoFilter);
      const effortDistribution = classifyEffortDistribution(pullRequests);
      const sync = getSyncStatus(id, "github_contributions") ?? getSyncStatus(id, "github_pull_requests");
      return { commitHistory, commitsYTD, pullRequests, effortDistribution, _syncedAt: sync?.lastSyncedAt };
    }

    if (!contribCached || !prCached) {
      syncDeveloper(id).catch((err) => console.error("[stats:github] Background sync error:", err));
    }

    let commitHistory: CommitDay[] = [];
    let commitsYTD = 0;
    let pullRequests: PullRequest[] = [];

    if (ctx.ghConn?.connected && ctx.ghConn.token && ctx.ghUsername) {
      const results = await Promise.allSettled([
        fetchContributionCalendar(ctx.ghConn.token, ctx.ghUsername),
        fetchPullRequests(ctx.ghConn.token, ctx.ghUsername, ctx.repoFilter, days),
      ]);
      if (results[0].status === "fulfilled") { commitHistory = results[0].value.commits; commitsYTD = results[0].value.totalContributions; }
      if (results[1].status === "fulfilled") { pullRequests = results[1].value; }
    }

    return { commitHistory, commitsYTD, pullRequests, effortDistribution: classifyEffortDistribution(pullRequests) };
  });

  ipcMain.handle("stats:velocity", async (_e, data: { developerId: string; days: number }) => {
    const { developerId: id, days } = data;
    const ctx = getStatsContext(id, days);
    if (!ctx) throw new Error("Developer not found");

    if (hasFreshCache(id, "github_pull_requests")) {
      const { velocity, velocityChange } = computeCachedVelocity(id, days, ctx.repoFilter);
      const mergeRatio = computeCachedMergeRatio(id, days, ctx.repoFilter);
      const sync = getSyncStatus(id, "github_pull_requests");
      return { velocity, velocityChange, mergeRatio, _syncedAt: sync?.lastSyncedAt };
    }

    syncDeveloper(id).catch((err) => console.error("[stats:velocity] Background sync error:", err));
    let velocity = 0, velocityChange = 0, mergeRatio = 0;

    if (ctx.ghConn?.connected && ctx.ghConn.token && ctx.ghUsername) {
      const results = await Promise.allSettled([
        fetchMergeRatio(ctx.ghConn.token, ctx.ghUsername, ctx.repoFilter, days),
        fetchVelocity(ctx.ghConn.token, ctx.ghUsername, ctx.repoFilter, days),
      ]);
      if (results[0].status === "fulfilled") mergeRatio = results[0].value;
      if (results[1].status === "fulfilled") { velocity = results[1].value.velocity; velocityChange = results[1].value.velocityChange; }
    }

    return { velocity, velocityChange, mergeRatio };
  });

  ipcMain.handle("stats:tickets", async (_e, data: { developerId: string; days: number }) => {
    const { developerId: id, days } = data;
    const ctx = getStatsContext(id, days);
    if (!ctx) throw new Error("Developer not found");

    if (hasFreshCache(id, "jira_tickets") && ctx.atConn?.org) {
      const jiraTickets = getCachedJiraTickets(id, ctx.atConn.org, days, ctx.projectFilter);
      const ticketVelocity = getCachedCompletedTicketCount(id, days, ctx.projectFilter);
      const syncedAt = getSyncStatus(id, "jira_tickets")?.lastSyncedAt;
      return { jiraTickets, workloadHealth: computeWorkloadHealth(jiraTickets), ticketVelocity, _syncedAt: syncedAt };
    }

    if (ctx.atConn?.connected && ctx.atConn.token && ctx.atConn.email && ctx.atConn.org && ctx.atEmail) {
      syncDeveloper(id).catch((err) => console.error("[stats:tickets] Background sync error:", err));
    }

    let jiraTickets: JiraTicket[] = [];
    let ticketVelocity = 0;

    if (ctx.atConn?.connected && ctx.atConn.token && ctx.atConn.email && ctx.atConn.org && ctx.atEmail) {
      const [t, v] = await Promise.allSettled([
        fetchJiraTickets(ctx.atConn.org, ctx.atConn.email, ctx.atConn.token, ctx.atEmail, ctx.projectFilter, days),
        fetchCompletedTicketCount(ctx.atConn.org, ctx.atConn.email, ctx.atConn.token, ctx.atEmail, ctx.projectFilter, days),
      ]);
      if (t.status === "fulfilled") jiraTickets = t.value;
      if (v.status === "fulfilled") ticketVelocity = v.value;
    }

    return { jiraTickets, workloadHealth: computeWorkloadHealth(jiraTickets), ticketVelocity };
  });

  ipcMain.handle("stats:confluence", async (_e, data: { developerId: string; days: number }) => {
    const { developerId: id, days } = data;
    const ctx = getStatsContext(id, days);
    if (!ctx) throw new Error("Developer not found");

    if (hasFreshCache(id, "confluence_pages")) {
      const confluenceDocs = getCachedConfluencePages(id, ctx.spaceFilter, ctx.atConn?.org ?? undefined) ?? [];
      const confluenceActivity = getCachedConfluenceActivity(id, ctx.spaceFilter, ctx.atConn?.org ?? undefined) ?? [];
      const docAuthorityLevel = Math.min(5, Math.max(1, confluenceDocs.length));
      const sync = getSyncStatus(id, "confluence_pages");
      return { confluenceDocs, confluenceActivity, docAuthorityLevel, _syncedAt: sync?.lastSyncedAt };
    }

    syncDeveloper(id).catch((err) => console.error("[stats:confluence] Background sync error:", err));
    let confluenceDocs: ConfluenceDoc[] = [];
    let confluenceActivity: ConfluenceActivity[] = [];

    if (ctx.atConn?.connected && ctx.atConn.token && ctx.atConn.email && ctx.atConn.org && ctx.atEmail) {
      const results = await Promise.allSettled([
        fetchConfluenceDocs(ctx.atConn.org, ctx.atConn.email, ctx.atConn.token, ctx.atEmail, ctx.spaceFilter),
        fetchConfluenceActivity(ctx.atConn.org, ctx.atConn.email, ctx.atConn.token, ctx.atEmail, ctx.spaceFilter),
      ]);
      if (results[0].status === "fulfilled") confluenceDocs = results[0].value;
      if (results[1].status === "fulfilled") confluenceActivity = results[1].value;
    }

    return { confluenceDocs, confluenceActivity, docAuthorityLevel: Math.min(5, Math.max(1, confluenceDocs.length)) };
  });
}
