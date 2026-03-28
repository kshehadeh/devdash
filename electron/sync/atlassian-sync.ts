// @ts-nocheck — fetch().json() returns unknown in strict mode
import { getDb } from "../db/index";
import { getConnection } from "../db/connections";
import { getDeveloper } from "../db/developers";
import { getSourcesForDeveloper } from "../db/sources";
import { getWorkEmailForDeveloper } from "../db/developer-identity";
import { jiraStatusCategoryFromApi } from "../jira-status-category";

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

export function getAtlassianContextForValidation(developerId: string) {
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
  const ctx = getAtlassianContextForValidation(developerId);
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
          const statusCategory = jiraStatusCategoryFromApi(issue.fields.status.statusCategory.key);

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

    // Run daily reconciliation to remove tickets deleted in Jira
    reconcileJiraTickets(developerId).catch((err) =>
      console.error("[SyncJiraTickets] Reconciliation error:", err),
    );
  } catch (err) {
    setSyncStatus(developerId, "jira_tickets", "error", String(err));
    throw err;
  }
}

// ---------- Jira Ticket Reconciliation (daily) ----------

export async function reconcileJiraTickets(developerId: string): Promise<void> {
  const db = getDb();
  const ctx = getAtlassianContextForValidation(developerId);
  if (!ctx || ctx.projectKeys.length === 0) return;

  const today = new Date().toISOString().split("T")[0];
  const log = db.prepare(
    "SELECT last_cursor FROM sync_log WHERE developer_id = ? AND data_type = 'jira_reconcile'",
  ).get(developerId) as { last_cursor: string | null } | undefined;

  if (log?.last_cursor === today) return; // already reconciled today

  const baseUrl = `https://${ctx.site}.atlassian.net`;
  const hdrs = atlHeaders(ctx.email, ctx.token);

  const accountId = await resolveAccountId(ctx.site, ctx.email, ctx.token, ctx.atlassianEmail);
  if (!accountId) return;

  const projectFilter = jqlProjectKeysInList(ctx.projectKeys);
  const jql = `assignee = "${accountId}" AND project IN (${projectFilter}) AND updated >= "-365d" ORDER BY updated ASC`;

  const liveKeys = new Set<string>();
  let nextPageToken: string | undefined;

  try {
    do {
      const body: Record<string, unknown> = { jql, maxResults: 100, fields: ["key"] };
      if (nextPageToken) body.nextPageToken = nextPageToken;

      const res = await fetch(`${baseUrl}/rest/api/3/search/jql`, {
        method: "POST",
        headers: hdrs,
        body: JSON.stringify(body),
      });

      if (!res.ok) break;

      const data = await res.json();
      const issues: { key: string }[] = data.issues ?? [];
      for (const issue of issues) liveKeys.add(issue.key);
      nextPageToken = data.nextPageToken ?? undefined;
    } while (nextPageToken);

    if (liveKeys.size === 0) return; // bail out if API returned nothing (avoids wiping cache on error)

    const cached = db.prepare(
      "SELECT issue_key FROM cached_jira_tickets WHERE developer_id = ?",
    ).all(developerId) as { issue_key: string }[];

    const toDelete = cached.map((r) => r.issue_key).filter((k) => !liveKeys.has(k));
    if (toDelete.length > 0) {
      const placeholders = toDelete.map(() => "?").join(", ");
      db.prepare(
        `DELETE FROM cached_jira_tickets WHERE developer_id = ? AND issue_key IN (${placeholders})`,
      ).run(developerId, ...toDelete);
      console.log(`[ReconcileJira] Removed ${toDelete.length} deleted ticket(s) for developer ${developerId}`);
    }

    db.prepare(`
      INSERT INTO sync_log (developer_id, data_type, last_synced_at, status, last_cursor)
      VALUES (?, 'jira_reconcile', datetime('now'), 'ok', ?)
      ON CONFLICT(developer_id, data_type) DO UPDATE SET
        last_synced_at = datetime('now'), status = 'ok', last_cursor = excluded.last_cursor
    `).run(developerId, today);
  } catch (err) {
    console.error("[ReconcileJira] Error:", err);
  }
}

// ---------- Confluence Pages Sync ----------

export async function syncConfluencePages(developerId: string): Promise<void> {
  const db = getDb();
  const ctx = getAtlassianContextForValidation(developerId);
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

// ---------- Confluence Space List Sync (org-level) ----------

export async function syncConfluenceSpaceList(): Promise<void> {
  const conn = getConnection("atlassian");
  if (!conn?.connected || !conn.token || !conn.email || !conn.org) return;

  const org = conn.org;
  const db = getDb();
  const hdrs = atlHeaders(conn.email, conn.token);
  const baseUrl = `https://${org}.atlassian.net/wiki`;

  try {
    const allSpaces: { key: string; name: string; type: string }[] = [];
    let start = 0;
    const limit = 100;
    const maxPages = 40;

    for (let page = 0; page < maxPages; page++) {
      const res = await fetch(`${baseUrl}/rest/api/space?limit=${limit}&start=${start}`, { headers: hdrs });
      if (!res.ok) {
        console.error("[SyncConfluenceSpaces] list failed:", res.status, await res.text().catch(() => ""));
        return;
      }
      const d = await res.json();
      const batch = d.results ?? [];
      for (const s of batch) {
        if (s?.key) allSpaces.push({ key: s.key, name: s.name ?? s.key, type: s.type ?? "global" });
      }
      if (batch.length < limit) break;
      start += batch.length;
    }

    const upsert = db.prepare(`
      INSERT INTO cached_confluence_spaces (org, space_key, space_name, space_type, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(org, space_key) DO UPDATE SET
        space_name = excluded.space_name, space_type = excluded.space_type, updated_at = excluded.updated_at
    `);

    db.transaction(() => {
      for (const s of allSpaces) {
        upsert.run(org, s.key, s.name, s.type);
      }
      // Reconcile: remove spaces no longer in Confluence
      const liveKeys = new Set(allSpaces.map((s) => s.key));
      const cached = db.prepare("SELECT space_key FROM cached_confluence_spaces WHERE org = ?").all(org) as { space_key: string }[];
      const toDelete = cached.filter((r) => !liveKeys.has(r.space_key)).map((r) => r.space_key);
      if (toDelete.length > 0) {
        const placeholders = toDelete.map(() => "?").join(", ");
        db.prepare(`DELETE FROM cached_confluence_spaces WHERE org = ? AND space_key IN (${placeholders})`).run(org, ...toDelete);
      }
    })();

    console.log(`[SyncConfluenceSpaces] Cached ${allSpaces.length} spaces for org ${org}`);
  } catch (err) {
    console.error("[SyncConfluenceSpaces] Error:", err);
  }
}

export function getCachedConfluenceSpaces(org: string, query: string): { key: string; name: string; type: string }[] {
  const db = getDb();
  if (!query) {
    return db.prepare(
      "SELECT space_key as key, space_name as name, space_type as type FROM cached_confluence_spaces WHERE org = ? ORDER BY space_name ASC",
    ).all(org) as { key: string; name: string; type: string }[];
  }
  const pattern = `%${query}%`;
  return db.prepare(
    "SELECT space_key as key, space_name as name, space_type as type FROM cached_confluence_spaces WHERE org = ? AND (space_key LIKE ? COLLATE NOCASE OR space_name LIKE ? COLLATE NOCASE) ORDER BY space_name ASC",
  ).all(org, pattern, pattern) as { key: string; name: string; type: string }[];
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
