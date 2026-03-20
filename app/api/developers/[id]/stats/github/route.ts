import { NextResponse } from "next/server";
import { getStatsContext, parseLookbackDays } from "../../../../../../lib/api/stats-context";
import {
  fetchContributionCalendar,
  fetchPullRequests,
  classifyEffortDistribution,
} from "../../../../../../lib/services/github";
import type { GithubStatsResponse, CommitDay, PullRequest } from "../../../../../../lib/types";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const days = parseLookbackDays(new URL(req.url).searchParams);
    const ctx = getStatsContext(id, days);
    if (!ctx) return NextResponse.json({ error: "Developer not found" }, { status: 404 });

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
