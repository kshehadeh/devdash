import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/db/index";

export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT
        cpr.developer_id,
        d.name AS developer_name,
        cpr.repo,
        cpr.pr_number,
        cpr.title,
        cpr.status,
        cpr.review_count,
        cpr.created_at,
        cpr.updated_at,
        cpr.merged_at
      FROM cached_pull_requests cpr
      INNER JOIN developers d ON d.id = cpr.developer_id
      ORDER BY cpr.updated_at DESC
    `).all() as {
      developer_id: string;
      developer_name: string;
      repo: string;
      pr_number: number;
      title: string;
      status: string;
      review_count: number;
      created_at: string;
      updated_at: string;
      merged_at: string | null;
    }[];

    const data = rows.map((r) => ({
      developerName: r.developer_name,
      repo: r.repo,
      number: r.pr_number,
      title: r.title,
      url: `https://github.com/${r.repo}/pull/${r.pr_number}`,
      status: r.status,
      reviewCount: r.review_count,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      mergedAt: r.merged_at,
    }));

    return NextResponse.json(data);
  } catch (err) {
    console.error("GET /api/reference/pull-requests error:", err);
    return NextResponse.json({ error: "Failed to fetch cached pull requests" }, { status: 500 });
  }
}
