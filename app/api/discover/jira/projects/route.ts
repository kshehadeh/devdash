import { NextResponse } from "next/server";
import { getConnection } from "../../../../../lib/db/connections";

interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
}

export async function GET() {
  try {
    const conn = getConnection("atlassian");
    if (!conn?.connected || !conn.token || !conn.email || !conn.org) {
      return NextResponse.json({ error: "Atlassian not connected" }, { status: 400 });
    }

    const auth = "Basic " + Buffer.from(`${conn.email}:${conn.token}`).toString("base64");
    const baseUrl = `https://${conn.org}.atlassian.net`;
    const hdrs = { Authorization: auth, Accept: "application/json" };

    const allProjects: { id: string; key: string; name: string; type: string }[] = [];
    let startAt = 0;
    const maxResults = 50;

    while (true) {
      const res = await fetch(
        `${baseUrl}/rest/api/3/project/search?maxResults=${maxResults}&startAt=${startAt}&orderBy=name`,
        { headers: hdrs },
      );
      if (!res.ok) break;

      const data = await res.json();
      const values: JiraProject[] = data.values ?? [];
      for (const p of values) {
        allProjects.push({ id: p.id, key: p.key, name: p.name, type: p.projectTypeKey });
      }

      if (data.isLast || values.length < maxResults) break;
      startAt += values.length;
    }

    return NextResponse.json(allProjects);
  } catch (err) {
    console.error("GET /api/discover/jira/projects error:", err);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}
