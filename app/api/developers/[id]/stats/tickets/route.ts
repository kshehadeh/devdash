import { NextResponse } from "next/server";
import { getStatsContext, parseLookbackDays } from "../../../../../../lib/api/stats-context";
import { fetchJiraTickets, fetchCompletedTicketCount } from "../../../../../../lib/services/atlassian";
import { hasFreshCache, getCachedCompletedTicketCount, getSyncStatus } from "../../../../../../lib/db/cache";
import { syncDeveloper } from "../../../../../../lib/sync/engine";
import type { TicketsStatsResponse, JiraTicket } from "../../../../../../lib/types";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const days = parseLookbackDays(new URL(req.url).searchParams);
    const ctx = getStatsContext(id, days);
    if (!ctx) return NextResponse.json({ error: "Developer not found" }, { status: 404 });

    // Open tickets are ALWAYS fetched live (volatile)
    let jiraTickets: JiraTicket[] = [];

    if (ctx.atConn?.connected && ctx.atConn.token && ctx.atConn.email && ctx.atConn.org && ctx.atEmail) {
      try {
        jiraTickets = await fetchJiraTickets(
          ctx.atConn.org, ctx.atConn.email, ctx.atConn.token, ctx.atEmail, ctx.projectFilter, days,
        );
      } catch (err) {
        console.error("Jira tickets error:", err);
      }
    }

    // Completed ticket count: try cache first, then live fallback
    let ticketVelocity = 0;
    let syncedAt: string | undefined;
    let usedCache = false;

    if (hasFreshCache(id, "jira_completed_tickets")) {
      ticketVelocity = getCachedCompletedTicketCount(id, days);
      syncedAt = getSyncStatus(id, "jira_completed_tickets")?.lastSyncedAt;
      usedCache = ticketVelocity > 0; // Don't trust cache if it reports zero — verify with live
    }

    if (!usedCache && ctx.atConn?.connected && ctx.atConn.token && ctx.atConn.email && ctx.atConn.org && ctx.atEmail) {
      try {
        ticketVelocity = await fetchCompletedTicketCount(
          ctx.atConn.org, ctx.atConn.email, ctx.atConn.token, ctx.atEmail, ctx.projectFilter, days,
        );
      } catch (err) {
        console.error("Completed ticket count error:", err);
      }
      // Trigger sync if no cache existed
      if (!hasFreshCache(id, "jira_completed_tickets")) {
        syncDeveloper(id).catch((err) => console.error("[Tickets route] Background sync error:", err));
      }
    }

    // Workload health from live open tickets
    const inProgressCount = jiraTickets.filter((t) => t.statusCategory === "in_progress").length;
    const todoCount = jiraTickets.filter((t) => t.statusCategory === "todo").length;
    const openCount = inProgressCount + todoCount;
    let workloadHealth = 10;
    if (openCount > 0) {
      const wipPenalty = Math.min(5, Math.max(0, (inProgressCount - 2) * 1.5));
      const volumePenalty = Math.min(5, Math.max(0, (openCount - 8) * 0.5));
      workloadHealth = Math.max(0, Math.round((10 - wipPenalty - volumePenalty) * 10) / 10);
    }

    const response: TicketsStatsResponse & { _syncedAt?: string } = {
      jiraTickets, workloadHealth, ticketVelocity, _syncedAt: syncedAt,
    };
    return NextResponse.json(response);
  } catch (err) {
    console.error("GET /stats/tickets error:", err);
    return NextResponse.json({ error: "Failed to fetch ticket stats" }, { status: 500 });
  }
}
