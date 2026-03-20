import { NextResponse } from "next/server";
import { getStatsContext, parseLookbackDays } from "../../../../../../lib/api/stats-context";
import { fetchConfluenceDocs, fetchConfluenceActivity } from "../../../../../../lib/services/atlassian";
import type { ConfluenceStatsResponse, ConfluenceDoc, ConfluenceActivity } from "../../../../../../lib/types";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const days = parseLookbackDays(new URL(req.url).searchParams);
    const ctx = getStatsContext(id, days);
    if (!ctx) return NextResponse.json({ error: "Developer not found" }, { status: 404 });

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
