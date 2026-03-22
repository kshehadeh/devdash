// @ts-nocheck — fetch().json() returns unknown in strict mode
import { getDb } from "../db/index";
import { getConnection } from "../db/connections";
import { getDeveloper } from "../db/developers";
import { getSourcesForDeveloper } from "../db/sources";
import { getWorkEmailForDeveloper } from "../db/developer-identity";

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

/** Jira JQL `project IN (...)` with quoted keys (avoids parse issues for some keys / team-managed projects). */
function jqlProjectKeysInList(keys: string[]): string {
  return keys
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => `"${k.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(", ");
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
  const workEmail = getWorkEmailForDeveloper(developerId);
  if (!dev || !workEmail || !atConn?.connected || !atConn.token || !atConn.email || !atConn.org) return null;

  const devSources = getSourcesForDeveloper(developerId);
  const projectKeys = devSources.filter((s) => s.type === "jira_project").map((s) => s.identifier);
  const spaceKeys = devSources.filter((s) => s.type === "confluence_space").map((s) => s.identifier);

  return {
    dev,
    site: atConn.org,
    email: atConn.email,
    token: atConn.token,
    atlassianEmail: workEmail,
    projectKeys,
    spaceKeys,
  };
}

// ---------- Jira Tickets Sync (all statuses) ----------

export async function syncJiraTickets(developerId: string): Promise<void> {
  const db = getDb();
  const ctx = getAtlassianContext(developerId);
  if (!ctx) return;

  setSyncStatus(developerId, "jira_tickets", "syncing");

  try {
    if (ctx.projectKeys.length === 0) {
      db.prepare("DELETE FROM cached_jira_tickets WHERE developer_id = ?").run(developerId);
      // Clear last_cursor so the next sync (after projects are assigned) uses the full lookback window.
      // Using "today" here caused incremental sync to skip all issues not updated since that date.
      setSyncStatus(developerId, "jira_tickets", "ok", null, null);
      return;
    }

    const baseUrl = `https://${ctx.site}.atlassian.net`;
    const hdrs = atlHeaders(ctx.email, ctx.token);

    const accountId = await resolveAccountId(ctx.site, ctx.email, ctx.token, ctx.atlassianEmail);
    if (!accountId) { setSyncStatus(developerId, "jira_tickets", "error", "Could not resolve account ID"); return; }

    const projectFilter = ` AND project IN (${jqlProjectKeysInList(ctx.projectKeys)})`;
    const syncLog = db.prepare(
      "SELECT last_cursor FROM sync_log WHERE developer_id = ? AND data_type = 'jira_tickets'",
    ).get(developerId) as { last_cursor: string | null } | undefined;

    const ninety = new Date();
    ninety.setDate(ninety.getDate() - 90);
    const sinceDefault = ninety.toISOString().split("T")[0];

    // If any assigned project has no rows in cache yet (new assignment, new project, or stale cursor),
    // use the full lookback instead of incremental — otherwise we can miss older issues.
    let missingCacheForProject = false;
    const countByProject = db.prepare(
      "SELECT COUNT(*) as c FROM cached_jira_tickets WHERE developer_id = ? AND UPPER(project_key) = UPPER(?)",
    );
    for (const pk of ctx.projectKeys) {
      const row = countByProject.get(developerId, pk) as { c: number };
      if (row.c === 0) {
        missingCacheForProject = true;
        break;
      }
    }

    let since: string;
    if (missingCacheForProject) {
      since = sinceDefault;
    } else if (syncLog?.last_cursor) {
      since = syncLog.last_cursor;
    } else {
      since = sinceDefault;
    }

    const jql = `assignee = "${accountId}" AND updated >= "${since}"${projectFilter} ORDER BY updated ASC`;

    const maxResults = 100;
    let nextPageToken: string | undefined;
    let latestUpdated = since;

    const upsert = db.prepare(`
      INSERT OR REPLACE INTO cached_jira_tickets
        (developer_id, issue_key, summary, status, status_category, project_key, updated_at, priority, issue_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    do {
      const body: Record<string, unknown> = { jql, maxResults, fields: ["summary", "status", "priority", "issuetype", "project", "updated"] };
      if (nextPageToken) body.nextPageToken = nextPageToken;

      const res = await fetch(`${baseUrl}/rest/api/3/search/jql`, {
        method: "POST",
        headers: hdrs,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("[SyncJiraTickets] search failed:", res.status, text);
        setSyncStatus(developerId, "jira_tickets", "error", `HTTP ${res.status}: ${text.slice(0, 200)}`);
        return;
      }

      const data = await res.json();
      const issues: {
        key: string;
        fields: {
          summary: string;
          status: { name: string; statusCategory: { key: string } };
          priority: { name: string } | null;
          issuetype: { name: string } | null;
          project: { key: string };
          updated: string;
        };
      }[] = data.issues ?? [];

      db.transaction(() => {
        for (const issue of issues) {
          const categoryKey = issue.fields.status.statusCategory.key;
          const statusCategory =
            categoryKey === "done" ? "done" :
            categoryKey === "indeterminate" ? "in_progress" : "todo";

          const rawPriority = (issue.fields.priority?.name ?? "Medium").toLowerCase();
          const priority =
            rawPriority === "highest" || rawPriority === "critical" || rawPriority === "blocker" ? "critical" :
            rawPriority === "high" ? "high" :
            rawPriority === "low" || rawPriority === "lowest" ? "low" : "medium";

          upsert.run(
            developerId,
            issue.key,
            issue.fields.summary,
            issue.fields.status.name,
            statusCategory,
            issue.fields.project.key,
            issue.fields.updated,
            priority,
            issue.fields.issuetype?.name ?? "Task",
          );
          if (issue.fields.updated > latestUpdated) latestUpdated = issue.fields.updated;
        }
      })();

      nextPageToken = data.nextPageToken ?? undefined;
    } while (nextPageToken);

    setSyncStatus(developerId, "jira_tickets", "ok", null, latestUpdated.split("T")[0]);
  } catch (err) {
    setSyncStatus(developerId, "jira_tickets", "error", String(err));
    throw err;
  }
}

// ---------- Confluence Pages Sync ----------

export async function syncConfluencePages(developerId: string): Promise<void> {
  const db = getDb();
  const ctx = getAtlassianContext(developerId);
  if (!ctx) return;

  setSyncStatus(developerId, "confluence_pages", "syncing");

  try {
    if (ctx.spaceKeys.length === 0) {
      db.prepare("DELETE FROM cached_confluence_pages WHERE developer_id = ?").run(developerId);
      setSyncStatus(developerId, "confluence_pages", "ok");
      return;
    }

    const baseUrl = `https://${ctx.site}.atlassian.net/wiki`;
    const hdrs = atlHeaders(ctx.email, ctx.token);

    const accountId = await resolveAccountId(ctx.site, ctx.email, ctx.token, ctx.atlassianEmail);
    if (!accountId) { setSyncStatus(developerId, "confluence_pages", "error", "Could not resolve account ID"); return; }

    const spaceFilter = ` AND space IN (${ctx.spaceKeys.map((k) => `"${k}"`).join(",")})`;

    // For Confluence, always do a full fetch of recent pages (no reliable incremental cursor)
    const cql = `contributor = "${accountId}" AND type = page${spaceFilter} ORDER BY lastmodified DESC`;
    const res = await fetch(
      `${baseUrl}/rest/api/content/search?cql=${encodeURIComponent(cql)}&limit=25&expand=version,space,history.lastUpdated`,
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
