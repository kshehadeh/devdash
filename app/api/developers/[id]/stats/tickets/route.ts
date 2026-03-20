import { NextResponse } from "next/server";
import { getStatsContext, parseLookbackDays } from "../../../../../../lib/api/stats-context";
import { fetchJiraTickets, fetchCompletedTicketCount } from "../../../../../../lib/services/atlassian";
import type { TicketsStatsResponse, JiraTicket } from "../../../../../../lib/types";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const days = parseLookbackDays(new URL(req.url).searchParams);
    const ctx = getStatsContext(id, days);
    if (!ctx) return NextResponse.json({ error: "Developer not found" }, { status: 404 });

    let jiraTickets: JiraTicket[] = [];
    let ticketVelocity = 0;

    if (ctx.atConn?.connected && ctx.atConn.token && ctx.atConn.email && ctx.atConn.org && ctx.atEmail) {
      const results = await Promise.allSettled([
        fetchJiraTickets(ctx.atConn.org, ctx.atConn.email, ctx.atConn.token, ctx.atEmail, ctx.projectFilter, days),
        fetchCompletedTicketCount(ctx.atConn.org, ctx.atConn.email, ctx.atConn.token, ctx.atEmail, ctx.projectFilter, days),
      ]);

      if (results[0].status === "fulfilled") {
        jiraTickets = results[0].value;
      } else {
        console.error("Jira tickets error:", results[0].reason);
      }

      if (results[1].status === "fulfilled") {
        ticketVelocity = results[1].value;
      } else {
        console.error("Completed ticket count error:", results[1].reason);
      }
    }

    // Workload health: penalise high in-progress count relative to total open tickets
    const inProgressCount = jiraTickets.filter((t) => t.statusCategory === "in_progress").length;
    const todoCount = jiraTickets.filter((t) => t.statusCategory === "todo").length;
    const openCount = inProgressCount + todoCount;
    let workloadHealth = 10;
    if (openCount > 0) {
      const wipPenalty = Math.min(5, Math.max(0, (inProgressCount - 2) * 1.5));
      const volumePenalty = Math.min(5, Math.max(0, (openCount - 8) * 0.5));
      workloadHealth = Math.max(0, Math.round((10 - wipPenalty - volumePenalty) * 10) / 10);
    }

    const response: TicketsStatsResponse = { jiraTickets, workloadHealth, ticketVelocity };
    return NextResponse.json(response);
  } catch (err) {
    console.error("GET /stats/tickets error:", err);
    return NextResponse.json({ error: "Failed to fetch ticket stats" }, { status: 500 });
  }
}
