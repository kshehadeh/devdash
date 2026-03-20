import { NextResponse } from "next/server";
import { getConnection } from "../../../../../lib/db/connections";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const org = searchParams.get("org");
    if (!org) {
      return NextResponse.json({ error: "org parameter required" }, { status: 400 });
    }

    const conn = getConnection("github");
    if (!conn?.connected || !conn.token) {
      return NextResponse.json({ error: "GitHub not connected" }, { status: 400 });
    }

    const headers = {
      Authorization: `Bearer ${conn.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };

    // Check if org is the authenticated user
    const userRes = await fetch("https://api.github.com/user", { headers });
    const user = userRes.ok ? await userRes.json() : null;
    const isUser = user && user.login === org;

    interface GHRepo {
      name: string;
      full_name: string;
      private: boolean;
      description: string | null;
      language: string | null;
      updated_at: string;
    }

    const allRepos: { name: string; fullName: string; isPrivate: boolean; description: string | null; language: string | null; updatedAt: string }[] = [];
    let page = 1;

    while (true) {
      const url = isUser
        ? `https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner&page=${page}`
        : `https://api.github.com/orgs/${org}/repos?per_page=100&sort=updated&page=${page}`;

      const res = await fetch(url, { headers });
      if (!res.ok) break;

      const repos: GHRepo[] = await res.json();
      for (const r of repos) {
        allRepos.push({
          name: r.name,
          fullName: r.full_name,
          isPrivate: r.private,
          description: r.description,
          language: r.language,
          updatedAt: r.updated_at,
        });
      }

      if (repos.length < 100) break;
      page++;
    }

    return NextResponse.json(allRepos);
  } catch (err) {
    console.error("GET /api/discover/github/repos error:", err);
    return NextResponse.json({ error: "Failed to fetch repos" }, { status: 500 });
  }
}
