import { NextResponse } from "next/server";
import { getStatsContext, parseLookbackDays } from "../../../../../../lib/api/stats-context";
import { fetchMergeRatio, fetchVelocity } from "../../../../../../lib/services/github";
import type { VelocityStatsResponse } from "../../../../../../lib/types";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const days = parseLookbackDays(new URL(req.url).searchParams);
    const ctx = getStatsContext(id, days);
    if (!ctx) return NextResponse.json({ error: "Developer not found" }, { status: 404 });

    let velocity = 0;
    let velocityChange = 0;
    let mergeRatio = 0;

    if (ctx.ghConn?.connected && ctx.ghConn.token && ctx.ghUsername) {
      const token = ctx.ghConn.token;
      const results = await Promise.allSettled([
        fetchMergeRatio(token, ctx.ghUsername, ctx.repoFilter, days),
        fetchVelocity(token, ctx.ghUsername, ctx.repoFilter, days),
      ]);

      if (results[0].status === "fulfilled") {
        mergeRatio = results[0].value;
      } else {
        console.error("GitHub merge ratio error:", results[0].reason);
      }

      if (results[1].status === "fulfilled") {
        velocity = results[1].value.velocity;
        velocityChange = results[1].value.velocityChange;
      } else {
        console.error("GitHub velocity error:", results[1].reason);
      }
    }

    const response: VelocityStatsResponse = { velocity, velocityChange, mergeRatio };
    return NextResponse.json(response);
  } catch (err) {
    console.error("GET /stats/velocity error:", err);
    return NextResponse.json({ error: "Failed to fetch velocity stats" }, { status: 500 });
  }
}
