import { NextResponse } from "next/server";
import { getStatsContext, parseLookbackDays } from "../../../../../../lib/api/stats-context";
import { fetchConfluenceDocs, fetchConfluenceActivity } from "../../../../../../lib/services/atlassian";
import {
  getCachedConfluencePages,
  getCachedConfluenceActivity,
  hasFreshCache,
  getSyncStatus,
} from "../../../../../../lib/db/cache";
import { syncDeveloper } from "../../../../../../lib/sync/engine";
import type { ConfluenceStatsResponse, ConfluenceDoc, ConfluenceActivity } from "../../../../../../lib/types";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const days = parseLookbackDays(new URL(req.url).searchParams);
    const ctx = getStatsContext(id, days);
    if (!ctx) return NextResponse.json({ error: "Developer not found" }, { status: 404 });

    // Serve from cache if available
    if (hasFreshCache(id, "confluence_pages")) {
      const confluenceDocs = getCachedConfluencePages(id, ctx.spaceFilter) ?? [];
      const confluenceActivity = getCachedConfluenceActivity(id, ctx.spaceFilter) ?? [];
      const docAuthorityLevel = Math.min(5, Math.max(1, confluenceDocs.length));
      const sync = getSyncStatus(id, "confluence_pages");

      const response: ConfluenceStatsResponse & { _syncedAt?: string } = {
        confluenceDocs, confluenceActivity, docAuthorityLevel,
        _syncedAt: sync?.lastSyncedAt,
      };
      return NextResponse.json(response);
    }

    // No cache — live fetch, trigger sync
    syncDeveloper(id).catch((err) => console.error("[Confluence route] Background sync error:", err));

    let confluenceDocs: ConfluenceDoc[] = [];
    let confluenceActivity: ConfluenceActivity[] = [];

    if (ctx.atConn?.connected && ctx.atConn.token && ctx.atConn.email && ctx.atConn.org && ctx.atEmail) {
      const results = await Promise.allSettled([
        fetchConfluenceDocs(ctx.atConn.org, ctx.atConn.email, ctx.atConn.token, ctx.atEmail, ctx.spaceFilter),
        fetchConfluenceActivity(ctx.atConn.org, ctx.atConn.email, ctx.atConn.token, ctx.atEmail, ctx.spaceFilter),
      ]);

      if (results[0].status === "fulfilled") {
        confluenceDocs = results[0].value;
      } else {
        console.error("Confluence docs error:", results[0].reason);
      }

      if (results[1].status === "fulfilled") {
        confluenceActivity = results[1].value;
      } else {
        console.error("Confluence activity error:", results[1].reason);
      }
    }

    const docAuthorityLevel = Math.min(5, Math.max(1, confluenceDocs.length));

    const response: ConfluenceStatsResponse = { confluenceDocs, confluenceActivity, docAuthorityLevel };
    return NextResponse.json(response);
  } catch (err) {
    console.error("GET /stats/confluence error:", err);
    return NextResponse.json({ error: "Failed to fetch Confluence stats" }, { status: 500 });
  }
}
