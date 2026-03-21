import { NextResponse } from "next/server";
import { syncAll, syncDeveloper } from "../../../../lib/sync/engine";

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const developerId = searchParams.get("developerId");

    if (developerId) {
      syncDeveloper(developerId).catch((err) =>
        console.error("[SyncTrigger] Developer sync error:", err),
      );
    } else {
      syncAll().catch((err) =>
        console.error("[SyncTrigger] Full sync error:", err),
      );
    }

    return NextResponse.json({ triggered: true });
  } catch (err) {
    console.error("POST /api/sync/trigger error:", err);
    return NextResponse.json({ error: "Failed to trigger sync" }, { status: 500 });
  }
}
