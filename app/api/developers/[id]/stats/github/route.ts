import { NextResponse } from "next/server";
import { getStatsContext, parseLookbackDays } from "../../../../../../lib/api/stats-context";
import {
  fetchContributionCalendar,
  fetchPullRequests,
  classifyEffortDistribution,
} from "../../../../../../lib/services/github";
import {
  getCachedContributions,
  getCachedCommitsYTD,
  getCachedPullRequests,
  hasFreshCache,
  getSyncStatus,
} from "../../../../../../lib/db/cache";
import { syncDeveloper } from "../../../../../../lib/sync/engine";
import type { GithubStatsResponse, CommitDay, PullRequest } from "../../../../../../lib/types";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const days = parseLookbackDays(new URL(req.url).searchParams);
    const ctx = getStatsContext(id, days);
    if (!ctx) return NextResponse.json({ error: "Developer not found" }, { status: 404 });

    const contribCached = hasFreshCache(id, "github_contributions");
    const prCached = hasFreshCache(id, "github_pull_requests");

    // Serve from cache if available
    if (contribCached && prCached) {
      const commitHistory = getCachedContributions(id) ?? [];
      const commitsYTD = getCachedCommitsYTD(id);
      const pullRequests = getCachedPullRequests(id, days, ctx.repoFilter);
      const effortDistribution = classifyEffortDistribution(pullRequests);

      const contribSync = getSyncStatus(id, "github_contributions");
      const prSync = getSyncStatus(id, "github_pull_requests");

      const response: GithubStatsResponse & { _syncedAt?: string } = {
        commitHistory,
        commitsYTD,
        pullRequests,
        effortDistribution,
        _syncedAt: contribSync?.lastSyncedAt ?? prSync?.lastSyncedAt,
      };
      return NextResponse.json(response);
    }

    // No cache — live fetch, trigger background sync for next time
    if (!contribCached || !prCached) {
      syncDeveloper(id).catch((err) => console.error("[GitHub route] Background sync error:", err));
    }

    let commitHistory: CommitDay[] = [];
    let commitsYTD = 0;
    let pullRequests: PullRequest[] = [];

    if (ctx.ghConn?.connected && ctx.ghConn.token && ctx.ghUsername) {
      const token = ctx.ghConn.token;
      const results = await Promise.allSettled([
        fetchContributionCalendar(token, ctx.ghUsername),
        fetchPullRequests(token, ctx.ghUsername, ctx.repoFilter, days),
      ]);

      if (results[0].status === "fulfilled") {
        commitHistory = results[0].value.commits;
        commitsYTD = results[0].value.totalContributions;
      } else {
        console.error("GitHub contributions error:", results[0].reason);
      }

      if (results[1].status === "fulfilled") {
        pullRequests = results[1].value;
      } else {
        console.error("GitHub PRs error:", results[1].reason);
      }
    }

    const effortDistribution = classifyEffortDistribution(pullRequests);

    const response: GithubStatsResponse = {
      commitHistory,
      commitsYTD,
      pullRequests,
      effortDistribution,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("GET /stats/github error:", err);
    return NextResponse.json({ error: "Failed to fetch GitHub stats" }, { status: 500 });
  }
}
