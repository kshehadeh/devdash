// @ts-nocheck — external API calls, fetch().json() returns unknown
import { ipcMain } from "electron";
import { getConnection } from "../db/connections";
import { fetchAllLinearTeams } from "../services/linear";

function ghHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
}

function atlAuth(email: string, token: string) {
  return "Basic " + Buffer.from(`${email}:${token}`).toString("base64");
}

export function registerDiscoverHandlers() {
  ipcMain.handle("discover:github:orgs", async () => {
    const conn = getConnection("github");
    if (!conn?.connected || !conn.token) throw new Error("GitHub not connected");
    const headers = ghHeaders(conn.token);

    const [orgsRes, userRes] = await Promise.all([
      fetch("https://api.github.com/user/orgs?per_page=100", { headers }),
      fetch("https://api.github.com/user", { headers }),
    ]);

    const orgs: { login: string; avatar_url: string }[] = [];
    if (userRes.ok) { const u = await userRes.json(); orgs.push({ login: u.login, avatar_url: u.avatar_url }); }
    if (orgsRes.ok) { for (const o of await orgsRes.json()) orgs.push({ login: o.login, avatar_url: o.avatar_url }); }
    return orgs;
  });

  ipcMain.handle("discover:github:repos", async (_e, data: { org: string }) => {
    if (!data.org) throw new Error("org parameter required");
    const conn = getConnection("github");
    if (!conn?.connected || !conn.token) throw new Error("GitHub not connected");
    const headers = ghHeaders(conn.token);

    const userRes = await fetch("https://api.github.com/user", { headers });
    const user = userRes.ok ? await userRes.json() : null;
    const isUser = user && user.login === data.org;

    const allRepos: { name: string; fullName: string; isPrivate: boolean; description: string | null; language: string | null; updatedAt: string }[] = [];
    let page = 1;
    while (true) {
      const url = isUser
        ? `https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner&page=${page}`
        : `https://api.github.com/orgs/${data.org}/repos?per_page=100&sort=updated&page=${page}`;
      const res = await fetch(url, { headers });
      if (!res.ok) break;
      const repos = await res.json();
      for (const r of repos) allRepos.push({ name: r.name, fullName: r.full_name, isPrivate: r.private, description: r.description, language: r.language, updatedAt: r.updated_at });
      if (repos.length < 100) break;
      page++;
    }
    return allRepos;
  });

  ipcMain.handle("discover:jira:projects", async () => {
    const conn = getConnection("atlassian");
    if (!conn?.connected || !conn.token || !conn.email || !conn.org) throw new Error("Atlassian not connected");
    const auth = atlAuth(conn.email, conn.token);
    const baseUrl = `https://${conn.org}.atlassian.net`;
    const hdrs = { Authorization: auth, Accept: "application/json" };

    const allProjects: { id: string; key: string; name: string; type: string }[] = [];
    let startAt = 0;
    while (true) {
      const res = await fetch(`${baseUrl}/rest/api/3/project/search?maxResults=50&startAt=${startAt}&orderBy=name`, { headers: hdrs });
      if (!res.ok) break;
      const data = await res.json();
      for (const p of data.values ?? []) allProjects.push({ id: p.id, key: p.key, name: p.name, type: p.projectTypeKey });
      if (data.isLast || (data.values ?? []).length < 50) break;
      startAt += (data.values ?? []).length;
    }
    return allProjects;
  });

  ipcMain.handle("discover:jira:boards", async (_e, data: { projectKey: string }) => {
    if (!data.projectKey) throw new Error("projectKey parameter required");
    const conn = getConnection("atlassian");
    if (!conn?.connected || !conn.token || !conn.email || !conn.org) throw new Error("Atlassian not connected");
    const auth = atlAuth(conn.email, conn.token);

    const res = await fetch(`https://${conn.org}.atlassian.net/rest/agile/1.0/board?projectKeyOrId=${data.projectKey}&maxResults=50`, {
      headers: { Authorization: auth, Accept: "application/json" },
    });
    if (!res.ok) throw new Error("Failed to fetch boards");
    const result = await res.json();
    return (result.values ?? []).map((b: { id: number; name: string; type: string }) => ({ id: b.id, name: b.name, type: b.type }));
  });

  ipcMain.handle("discover:confluence:spaces", async (_e, data?: { q?: string }) => {
    const conn = getConnection("atlassian");
    if (!conn?.connected || !conn.token || !conn.email || !conn.org) throw new Error("Atlassian not connected");
    const auth = atlAuth(conn.email, conn.token);
    const baseUrl = `https://${conn.org}.atlassian.net/wiki`;
    const hdrs = { Authorization: auth, Accept: "application/json" };
    const query = data?.q?.trim() ?? "";

    if (query) {
      const cql = `type = space AND title ~ "${query}"`;
      const res = await fetch(`${baseUrl}/rest/api/search?cql=${encodeURIComponent(cql)}&limit=25`, { headers: hdrs });
      if (res.ok) {
        const d = await res.json();
        return (d.results ?? []).filter((i: any) => (i.space ?? i).key).map((i: any) => { const s = i.space ?? i; return { id: s.id ?? 0, key: s.key, name: s.name, type: s.type ?? "global" }; });
      }
    }

    const res = await fetch(`${baseUrl}/rest/api/space?limit=20`, { headers: hdrs });
    if (!res.ok) throw new Error("Failed to fetch spaces");
    const d = await res.json();
    return (d.results ?? []).map((s: any) => ({ id: s.id, key: s.key, name: s.name, type: s.type }));
  });

  ipcMain.handle("discover:linear:teams", async () => {
    const conn = getConnection("linear");
    if (!conn?.connected || !conn.token) throw new Error("Linear not connected");
    return fetchAllLinearTeams(conn.token);
  });
}
