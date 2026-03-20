import { NextResponse } from "next/server";
import { getConnection } from "../../../../../lib/db/connections";

export async function GET() {
  try {
    const conn = getConnection("github");
    if (!conn?.connected || !conn.token) {
      return NextResponse.json({ error: "GitHub not connected" }, { status: 400 });
    }

    const headers = {
      Authorization: `Bearer ${conn.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };

    // Fetch orgs and the authenticated user (for personal repos)
    const [orgsRes, userRes] = await Promise.all([
      fetch("https://api.github.com/user/orgs?per_page=100", { headers }),
      fetch("https://api.github.com/user", { headers }),
    ]);

    const orgs: { login: string; avatar_url: string }[] = [];

    if (userRes.ok) {
      const user = await userRes.json();
      orgs.push({ login: user.login, avatar_url: user.avatar_url });
    }

    if (orgsRes.ok) {
      const orgList = await orgsRes.json();
      for (const org of orgList) {
        orgs.push({ login: org.login, avatar_url: org.avatar_url });
      }
    }

    return NextResponse.json(orgs);
  } catch (err) {
    console.error("GET /api/discover/github/orgs error:", err);
    return NextResponse.json({ error: "Failed to fetch orgs" }, { status: 500 });
  }
}
