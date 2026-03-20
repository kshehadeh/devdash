import { NextResponse } from "next/server";
import { getStatsContext, parseLookbackDays } from "../../../../../../lib/api/stats-context";
import { fetchActiveSprint } from "../../../../../../lib/services/atlassian";
import type { SprintStatsResponse, Sprint } from "../../../../../../lib/types";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const days = parseLookbackDays(new URL(req.url).searchParams);
    const ctx = getStatsContext(id, days);
    if (!ctx) return NextResponse.json({ error: "Developer not found" }, { status: 404 });

    let sprint: Sprint = {
      name: "No active sprint",
      currentDay: 0,
      totalDays: 0,
      status: "on_track",
      cycleTime: 0,
      throughput: 0,
      overdueCount: 0,
      issues: [],
    };

    if (ctx.atConn?.connected && ctx.atConn.token && ctx.atConn.email && ctx.atConn.org && ctx.atEmail) {
      try {
        const result = await fetchActiveSprint(
          ctx.atConn.org, ctx.atConn.email, ctx.atConn.token, ctx.atEmail, ctx.boardFilter,
        );
        if (result) sprint = result;
      } catch (err) {
        console.error("Jira sprint error:", err);
      }
    }

    const response: SprintStatsResponse = { sprint };
    return NextResponse.json(response);
  } catch (err) {
    console.error("GET /stats/sprint error:", err);
    return NextResponse.json({ error: "Failed to fetch sprint stats" }, { status: 500 });
  }
}
