import { NextResponse } from "next/server";
import { getConnection } from "../../../../../lib/db/connections";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectKey = searchParams.get("projectKey");
    if (!projectKey) {
      return NextResponse.json({ error: "projectKey parameter required" }, { status: 400 });
    }

    const conn = getConnection("atlassian");
    if (!conn?.connected || !conn.token || !conn.email || !conn.org) {
      return NextResponse.json({ error: "Atlassian not connected" }, { status: 400 });
    }

    const auth = "Basic " + Buffer.from(`${conn.email}:${conn.token}`).toString("base64");
    const baseUrl = `https://${conn.org}.atlassian.net`;

    const res = await fetch(
      `${baseUrl}/rest/agile/1.0/board?projectKeyOrId=${projectKey}&maxResults=50`,
      { headers: { Authorization: auth, Accept: "application/json" } },
    );

    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch boards" }, { status: res.status });
    }

    const data = await res.json();
    const boards = (data.values ?? []).map((b: { id: number; name: string; type: string }) => ({
      id: b.id,
      name: b.name,
      type: b.type,
    }));

    return NextResponse.json(boards);
  } catch (err) {
    console.error("GET /api/discover/jira/boards error:", err);
    return NextResponse.json({ error: "Failed to fetch boards" }, { status: 500 });
  }
}
