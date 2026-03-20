import { NextResponse } from "next/server";
import { getConnection } from "../../../../../lib/db/connections";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() ?? "";

    const conn = getConnection("atlassian");
    if (!conn?.connected || !conn.token || !conn.email || !conn.org) {
      return NextResponse.json({ error: "Atlassian not connected" }, { status: 400 });
    }

    const auth = "Basic " + Buffer.from(`${conn.email}:${conn.token}`).toString("base64");
    const baseUrl = `https://${conn.org}.atlassian.net/wiki`;
    const hdrs = { Authorization: auth, Accept: "application/json" };

    if (query) {
      // Server-side search using CQL
      const cql = `type = space AND title ~ "${query}"`;
      const res = await fetch(
        `${baseUrl}/rest/api/search?cql=${encodeURIComponent(cql)}&limit=25`,
        { headers: hdrs },
      );

      if (!res.ok) {
        // Fallback: paginate /rest/api/space and filter server-side
        return NextResponse.json(await paginateAndFilter(baseUrl, hdrs, query));
      }

      const data = await res.json();
      const results: { id: number; key: string; name: string; type: string }[] = [];
      for (const item of data.results ?? []) {
        const space = item.space ?? item;
        if (space.key && space.name) {
          results.push({ id: space.id ?? 0, key: space.key, name: space.name, type: space.type ?? "global" });
        }
      }
      return NextResponse.json(results);
    }

    // No query — return a small initial batch
    const res = await fetch(`${baseUrl}/rest/api/space?limit=20`, { headers: hdrs });
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch spaces" }, { status: res.status });
    }

    const data = await res.json();
    const spaces = (data.results ?? []).map((s: { id: number; key: string; name: string; type: string }) => ({
      id: s.id,
      key: s.key,
      name: s.name,
      type: s.type,
    }));
    return NextResponse.json(spaces);
  } catch (err) {
    console.error("GET /api/discover/confluence/spaces error:", err);
    return NextResponse.json({ error: "Failed to fetch spaces" }, { status: 500 });
  }
}

async function paginateAndFilter(
  baseUrl: string,
  hdrs: Record<string, string>,
  query: string,
): Promise<{ id: number; key: string; name: string; type: string }[]> {
  const matches: { id: number; key: string; name: string; type: string }[] = [];
  const lowerQ = query.toLowerCase();
  let start = 0;
  const limit = 100;

  while (matches.length < 25) {
    const res = await fetch(`${baseUrl}/rest/api/space?limit=${limit}&start=${start}`, { headers: hdrs });
    if (!res.ok) break;

    const data = await res.json();
    const results: { id: number; key: string; name: string; type: string }[] = data.results ?? [];

    for (const s of results) {
      if (s.name.toLowerCase().includes(lowerQ) || s.key.toLowerCase().includes(lowerQ)) {
        matches.push({ id: s.id, key: s.key, name: s.name, type: s.type });
      }
    }

    if (results.length < limit) break;
    start += results.length;
  }

  return matches.slice(0, 25);
}
