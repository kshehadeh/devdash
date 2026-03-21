import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/db/index";

export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT
        ccp.developer_id,
        d.name AS developer_name,
        ccp.page_id,
        ccp.title,
        ccp.space_key,
        ccp.version_count,
        ccp.view_count,
        ccp.last_modified
      FROM cached_confluence_pages ccp
      INNER JOIN developers d ON d.id = ccp.developer_id
      ORDER BY ccp.last_modified DESC
    `).all() as {
      developer_id: string;
      developer_name: string;
      page_id: string;
      title: string;
      space_key: string | null;
      version_count: number;
      view_count: number;
      last_modified: string;
    }[];

    const data = rows.map((r) => ({
      developerName: r.developer_name,
      pageId: r.page_id,
      title: r.title,
      spaceKey: r.space_key ?? "—",
      versionCount: r.version_count,
      viewCount: r.view_count,
      lastModified: r.last_modified,
    }));

    return NextResponse.json(data);
  } catch (err) {
    console.error("GET /api/reference/documents error:", err);
    return NextResponse.json({ error: "Failed to fetch cached documents" }, { status: 500 });
  }
}
