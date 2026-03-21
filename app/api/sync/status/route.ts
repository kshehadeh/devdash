import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/db/index";
import { getAllSyncStatuses } from "../../../../lib/db/cache";
import { isSyncing } from "../../../../lib/sync/engine";

export async function GET() {
  try {
    const db = getDb();
    const devs = db.prepare("SELECT id, name FROM developers").all() as { id: string; name: string }[];

    const developers = devs.map((dev) => {
      const types = getAllSyncStatuses(dev.id);
      const allTimes = Object.values(types).map((t) => t.lastSyncedAt).filter(Boolean);
      const lastSyncedAt = allTimes.length > 0
        ? allTimes.sort().pop()!
        : null;

      return {
        id: dev.id,
        name: dev.name,
        lastSyncedAt,
        types,
      };
    });

    return NextResponse.json({ syncing: isSyncing(), developers });
  } catch (err) {
    console.error("GET /api/sync/status error:", err);
    return NextResponse.json({ error: "Failed to get sync status" }, { status: 500 });
  }
}
