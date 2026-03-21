import { getDb } from "../db/index";
import { getConnection } from "../db/connections";
import { getDeveloper } from "../db/developers";
import { getSourcesForDeveloper } from "../db/sources";

function basicAuth(email: string, token: string): string {
  return "Basic " + Buffer.from(`${email}:${token}`).toString("base64");
}

function atlHeaders(email: string, token: string) {
  return {
    Authorization: basicAuth(email, token),
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

// Shared account ID cache (module-level)
const accountIdCache = new Map<string, string>();

async function resolveAccountId(
  site: string, email: string, token: string, lookupEmail: string,
): Promise<string | null> {
  const key = `${site}:${lookupEmail}`;
  if (accountIdCache.has(key)) return accountIdCache.get(key)!;

  const baseUrl = `https://${site}.atlassian.net`;
  const hdrs = atlHeaders(email, token);

  try {
    const res = await fetch(`${baseUrl}/rest/api/3/user/picker?query=${encodeURIComponent(lookupEmail)}&maxResults=1`, { headers: hdrs });
    if (res.ok) {
      const data = await res.json();
      const users: { accountId: string }[] = data.users ?? [];
      if (users.length > 0) { accountIdCache.set(key, users[0].accountId); return users[0].accountId; }
    }
  } catch { /* fall through */ }

  try {
    const res = await fetch(`${baseUrl}/rest/api/3/user/search?query=${encodeURIComponent(lookupEmail)}&maxResults=5`, { headers: hdrs });
    if (res.ok) {
      const users: { accountId: string }[] = await res.json();
      if (users.length > 0) { accountIdCache.set(key, users[0].accountId); return users[0].accountId; }
    }
  } catch { /* fall through */ }

  return null;
}

function getAtlassianContext(developerId: string) {
  const dev = getDeveloper(developerId);
  const atConn = getConnection("atlassian");
  if (!dev?.atlassianEmail || !atConn?.connected || !atConn.token || !atConn.email || !atConn.org) return null;

  const devSources = getSourcesForDeveloper(developerId);
  const projectKeys = devSources.filter((s) => s.type === "jira_project").map((s) => s.identifier);
  const spaceKeys = devSources.filter((s) => s.type === "confluence_space").map((s) => s.identifier);

  return {
    dev,
    site: atConn.org,
    email: atConn.email,
    token: atConn.token,
    atlassianEmail: dev.atlassianEmail,
    projectKeys,
    spaceKeys,
  };
}

// ---------- Completed Tickets Sync ----------

export async function syncCompletedTickets(developerId: string): Promise<void> {
  const db = getDb();
  const ctx = getAtlassianContext(developerId);
  if (!ctx) return;
  if (ctx.projectKeys.length === 0) return;

  setSyncStatus(developerId, "jira_completed_tickets", "syncing");

  try {
    const baseUrl = `https://${ctx.site}.atlassian.net`;
    const hdrs = atlHeaders(ctx.email, ctx.token);

    const accountId = await resolveAccountId(ctx.site, ctx.email, ctx.token, ctx.atlassianEmail);
    if (!accountId) { setSyncStatus(developerId, "jira_completed_tickets", "error", "Could not resolve account ID"); return; }

    // Determine start date
    const syncLog = db.prepare(
      "SELECT last_cursor FROM sync_log WHERE developer_id = ? AND data_type = 'jira_completed_tickets'",
    ).get(developerId) as { last_cursor: string | null } | undefined;

    let since: string;
    if (syncLog?.last_cursor) {
      since = syncLog.last_cursor;
    } else {
      const d = new Date();
      d.setDate(d.getDate() - 90);
      since = d.toISOString().split("T")[0];
    }

    const projectFilter = ` AND project IN (${ctx.projectKeys.join(",")})`;

    const jql = `assignee = "${accountId}" AND statusCategory = Done AND status changed AFTER "${since}"${projectFilter} ORDER BY updated ASC`;

    let startAt = 0;
    const maxResults = 100;
    let hasMore = true;
    let latestResolved = since;

    const upsert = db.prepare(`
      INSERT OR REPLACE INTO cached_completed_tickets
        (developer_id, issue_key, summary, resolved_at, project_key)
      VALUES (?, ?, ?, ?, ?)
    `);

    while (hasMore) {
      const res = await fetch(`${baseUrl}/rest/api/3/search/jql`, {
        method: "POST",
        headers: hdrs,
        body: JSON.stringify({
          jql,
          maxResults,
          startAt,
          fields: ["summary", "resolutiondate", "project", "updated"],
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("[SyncCompletedTickets] search failed:", res.status, body);
        break;
      }

      const data = await res.json();
      console.log("[SyncCompletedTickets] response keys:", Object.keys(data), "issues:", data.issues?.length);
      const issues: {
        key: string;
        fields: {
          summary: string;
          resolutiondate: string | null;
          project: { key: string };
          updated: string;
        };
      }[] = data.issues ?? [];

      db.transaction(() => {
        for (const issue of issues) {
          const resolvedAt = issue.fields.resolutiondate ?? issue.fields.updated;
          upsert.run(
            developerId,
            issue.key,
            issue.fields.summary,
            resolvedAt,
            issue.fields.project.key,
          );
          if (resolvedAt > latestResolved) latestResolved = resolvedAt;
        }
      })();

      hasMore = issues.length === maxResults;
      startAt += maxResults;
    }

    setSyncStatus(developerId, "jira_completed_tickets", "ok", null, latestResolved.split("T")[0]);
  } catch (err) {
    setSyncStatus(developerId, "jira_completed_tickets", "error", String(err));
    throw err;
  }
}

// ---------- Confluence Pages Sync ----------

export async function syncConfluencePages(developerId: string): Promise<void> {
  const db = getDb();
  const ctx = getAtlassianContext(developerId);
  if (!ctx) return;
  if (ctx.spaceKeys.length === 0) return;

  setSyncStatus(developerId, "confluence_pages", "syncing");

  try {
    const baseUrl = `https://${ctx.site}.atlassian.net/wiki`;
    const hdrs = atlHeaders(ctx.email, ctx.token);

    const accountId = await resolveAccountId(ctx.site, ctx.email, ctx.token, ctx.atlassianEmail);
    if (!accountId) { setSyncStatus(developerId, "confluence_pages", "error", "Could not resolve account ID"); return; }

    const spaceFilter = ` AND space IN (${ctx.spaceKeys.map((k) => `"${k}"`).join(",")})`;

    // For Confluence, always do a full fetch of recent pages (no reliable incremental cursor)
    const cql = `contributor = "${accountId}" AND type = page${spaceFilter} ORDER BY lastmodified DESC`;
    const res = await fetch(
      `${baseUrl}/rest/api/content/search?cql=${encodeURIComponent(cql)}&limit=25&expand=version`,
      { headers: hdrs },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[SyncConfluence] search failed:", res.status, body);
      setSyncStatus(developerId, "confluence_pages", "error", `HTTP ${res.status}`);
      return;
    }

    const data = await res.json();
    const results: {
      id: string;
      title: string;
      version?: { number: number };
      space?: { key: string };
      history?: { lastUpdated?: { when: string } };
      _links?: { webui: string };
    }[] = data.results ?? [];

    // Fetch view counts in parallel (this is the slow part)
    const pagesWithViews = await Promise.all(
      results.map(async (page) => {
        let viewCount = 0;
        try {
          const analyticsRes = await fetch(
            `${baseUrl}/rest/api/analytics/content/${page.id}/views`,
            { headers: hdrs },
          );
          if (analyticsRes.ok) {
            const analytics = await analyticsRes.json();
            viewCount = analytics.count ?? 0;
          }
        } catch { /* Views API may not be available */ }
        return { ...page, viewCount };
      }),
    );

    const upsert = db.prepare(`
      INSERT OR REPLACE INTO cached_confluence_pages
        (developer_id, page_id, title, space_key, version_count, view_count, last_modified)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    db.transaction(() => {
      for (const page of pagesWithViews) {
        const lastModified = page.history?.lastUpdated?.when ?? new Date().toISOString();
        upsert.run(
          developerId,
          page.id,
          page.title,
          page.space?.key ?? "",
          page.version?.number ?? 0,
          page.viewCount,
          lastModified,
        );
      }
    })();

    setSyncStatus(developerId, "confluence_pages", "ok");
  } catch (err) {
    setSyncStatus(developerId, "confluence_pages", "error", String(err));
    throw err;
  }
}

// ---------- Helpers ----------

function setSyncStatus(
  developerId: string,
  dataType: string,
  status: "ok" | "error" | "syncing",
  errorMessage?: string | null,
  cursor?: string | null,
) {
  const db = getDb();
  if (cursor !== undefined) {
    db.prepare(`
      INSERT INTO sync_log (developer_id, data_type, last_synced_at, status, error_message, last_cursor)
      VALUES (?, ?, datetime('now'), ?, ?, ?)
      ON CONFLICT(developer_id, data_type) DO UPDATE SET
        last_synced_at = datetime('now'), status = excluded.status,
        error_message = excluded.error_message, last_cursor = excluded.last_cursor
    `).run(developerId, dataType, status, errorMessage ?? null, cursor);
  } else {
    db.prepare(`
      INSERT INTO sync_log (developer_id, data_type, last_synced_at, status, error_message, last_cursor)
      VALUES (?, ?, datetime('now'), ?, ?, NULL)
      ON CONFLICT(developer_id, data_type) DO UPDATE SET
        last_synced_at = datetime('now'), status = excluded.status,
        error_message = excluded.error_message
    `).run(developerId, dataType, status, errorMessage ?? null);
  }
}
