import { NextResponse } from "next/server";
import { getStatsContext, parseLookbackDays } from "../../../../../../lib/api/stats-context";
import { fetchJiraTickets, fetchCompletedTicketCount } from "../../../../../../lib/services/atlassian";
import {
  hasFreshCache,
  getCachedJiraTickets,
  getCachedCompletedTicketCount,
  getSyncStatus,
} from "../../../../../../lib/db/cache";
import { syncDeveloper } from "../../../../../../lib/sync/engine";
import type { TicketsStatsResponse, JiraTicket } from "../../../../../../lib/types";

function computeWorkloadHealth(tickets: JiraTicket[]): number {
  const inProgressCount = tickets.filter((t) => t.statusCategory === "in_progress").length;
  const todoCount = tickets.filter((t) => t.statusCategory === "todo").length;
  const openCount = inProgressCount + todoCount;
  if (openCount === 0) return 10;
  const wipPenalty = Math.min(5, Math.max(0, (inProgressCount - 2) * 1.5));
  const volumePenalty = Math.min(5, Math.max(0, (openCount - 8) * 0.5));
  return Math.max(0, Math.round((10 - wipPenalty - volumePenalty) * 10) / 10);
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const days = parseLookbackDays(new URL(req.url).searchParams);
    const ctx = getStatsContext(id, days);
    if (!ctx) return NextResponse.json({ error: "Developer not found" }, { status: 404 });

    const cacheReady = hasFreshCache(id, "jira_tickets");

    // Serve everything from cache if available
    if (cacheReady && ctx.atConn?.org) {
      const jiraTickets = getCachedJiraTickets(id, ctx.atConn.org, days, ctx.projectFilter);
      const ticketVelocity = getCachedCompletedTicketCount(id, days, ctx.projectFilter);
      const syncedAt = getSyncStatus(id, "jira_tickets")?.lastSyncedAt;

      const response: TicketsStatsResponse & { _syncedAt?: string } = {
        jiraTickets,
        workloadHealth: computeWorkloadHealth(jiraTickets),
        ticketVelocity,
        _syncedAt: syncedAt,
      };
      return NextResponse.json(response);
    }

    // No cache — fall back to live fetch and trigger a background sync
    if (ctx.atConn?.connected && ctx.atConn.token && ctx.atConn.email && ctx.atConn.org && ctx.atEmail) {
      syncDeveloper(id).catch((err) => console.error("[Tickets route] Background sync error:", err));
    }

    let jiraTickets: JiraTicket[] = [];
    let ticketVelocity = 0;

    if (ctx.atConn?.connected && ctx.atConn.token && ctx.atConn.email && ctx.atConn.org && ctx.atEmail) {
      const [ticketsResult, velocityResult] = await Promise.allSettled([
        fetchJiraTickets(ctx.atConn.org, ctx.atConn.email, ctx.atConn.token, ctx.atEmail, ctx.projectFilter, days),
        fetchCompletedTicketCount(ctx.atConn.org, ctx.atConn.email, ctx.atConn.token, ctx.atEmail, ctx.projectFilter, days),
      ]);
      if (ticketsResult.status === "fulfilled") jiraTickets = ticketsResult.value;
      else console.error("Jira tickets live fetch error:", ticketsResult.reason);
      if (velocityResult.status === "fulfilled") ticketVelocity = velocityResult.value;
      else console.error("Completed ticket count live fetch error:", velocityResult.reason);
    }

    const response: TicketsStatsResponse = {
      jiraTickets,
      workloadHealth: computeWorkloadHealth(jiraTickets),
      ticketVelocity,
    };
    return NextResponse.json(response);
  } catch (err) {
    console.error("GET /stats/tickets error:", err);
    return NextResponse.json({ error: "Failed to fetch ticket stats" }, { status: 500 });
  }
}
