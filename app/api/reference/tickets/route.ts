import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/db/index";

export async function GET() {
  try {
    const db = getDb();

    const conn = db.prepare("SELECT org FROM connections WHERE id = 'atlassian'").get() as { org: string } | undefined;
    const site = conn?.org ?? "";

    const rows = db.prepare(`
      SELECT
        cjt.developer_id,
        d.name AS developer_name,
        cjt.issue_key,
        cjt.summary,
        cjt.status,
        cjt.status_category,
        cjt.project_key,
        cjt.updated_at
      FROM cached_jira_tickets cjt
      INNER JOIN developers d ON d.id = cjt.developer_id
      ORDER BY cjt.updated_at DESC
    `).all() as {
      developer_id: string;
      developer_name: string;
      issue_key: string;
      summary: string;
      status: string;
      status_category: string;
      project_key: string | null;
      updated_at: string;
    }[];

    const data = rows.map((r) => ({
      developerName: r.developer_name,
      issueKey: r.issue_key,
      summary: r.summary,
      status: r.status,
      statusCategory: r.status_category,
      projectKey: r.project_key ?? "—",
      updatedAt: r.updated_at,
      url: site ? `https://${site}.atlassian.net/browse/${r.issue_key}` : "",
    }));

    return NextResponse.json(data);
  } catch (err) {
    console.error("GET /api/reference/tickets error:", err);
    return NextResponse.json({ error: "Failed to fetch cached tickets" }, { status: 500 });
  }
}
