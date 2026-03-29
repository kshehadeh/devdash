// @ts-nocheck — copied from lib/services, fetch().json() returns unknown in strict mode
import type { JiraTicket, ConfluenceDoc, ConfluenceActivity } from "../types";
import { jiraStatusCategoryFromApi } from "../jira-status-category";

function basicAuth(email: string, token: string): string {
  return "Basic " + Buffer.from(`${email}:${token}`).toString("base64");
}

function headers(email: string, token: string) {
  return {
    Authorization: basicAuth(email, token),
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

// ---------- Jira ----------

function jqlProjectKeysInList(keys: string[]): string {
  return keys
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => `"${k.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(", ");
}

// ---------- Jira Tickets (assigned to user, open, recently updated) ----------

export async function fetchJiraTickets(
  site: string,
  email: string,
  token: string,
  atlassianEmail: string,
  projectKeys?: string[],
  days = 30,
): Promise<JiraTicket[]> {
  if (projectKeys !== undefined && projectKeys.length === 0) return [];

  const baseUrl = `https://${site}.atlassian.net`;
  const hdrs = headers(email, token);

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);
  const since = sinceDate.toISOString().split("T")[0];

  const projectFilter =
    projectKeys && projectKeys.length > 0 ? ` AND project IN (${jqlProjectKeysInList(projectKeys)})` : "";

  // Resolve account ID — Jira Cloud JQL requires accountId for assignee
  const accountId = await resolveAccountId(site, email, token, atlassianEmail);
  if (!accountId) {
    console.error("Could not resolve Atlassian account ID for:", atlassianEmail);
    return [];
  }

  const jql = `assignee = "${accountId}" AND statusCategory != Done AND updated >= "${since}"${projectFilter} ORDER BY updated DESC`;
  console.log("[JiraTickets] JQL:", jql);
  console.log("[JiraTickets] accountId:", accountId, "email:", atlassianEmail, "days:", days, "projects:", projectKeys);

  const url = `${baseUrl}/rest/api/3/search/jql`;
  console.log("[JiraTickets] URL:", url);

  const res = await fetch(url, {
    method: "POST",
    headers: { ...hdrs, "Content-Type": "application/json" },
    body: JSON.stringify({ jql, maxResults: 20, fields: ["summary", "status", "priority", "issuetype", "updated"] }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[JiraTickets] search failed:", res.status, body);
    return [];
  }

  const data = await res.json();
  console.log("[JiraTickets] total results:", data.total, "returned:", data.issues?.length ?? 0);
  const issues: {
    id: string;
    key: string;
    fields: {
      summary: string;
      status: { name: string; statusCategory: { key: string } };
      priority: { name: string };
      issuetype: { name: string };
      updated: string;
    };
  }[] = data.issues ?? [];

  return issues.map((issue) => ({
    id: issue.id,
    key: issue.key,
    title: issue.fields.summary,
    status: issue.fields.status.name,
    statusCategory: jiraStatusCategoryFromApi(issue.fields.status.statusCategory.key),
    priority: mapPriority(issue.fields.priority.name),
    type: issue.fields.issuetype.name,
    updatedAt: issue.fields.updated,
    updatedAgo: timeAgo(issue.fields.updated),
    url: `${baseUrl}/browse/${issue.key}`,
  }));
}

/** Assigned To Do + In Progress issues, no updated lookback (dashboard). In-progress first, then updated DESC. */
export async function fetchJiraDashboardTickets(
  site: string,
  email: string,
  token: string,
  atlassianEmail: string,
  projectKeys?: string[],
): Promise<JiraTicket[]> {
  if (projectKeys !== undefined && projectKeys.length === 0) return [];

  const baseUrl = `https://${site}.atlassian.net`;
  const hdrs = headers(email, token);

  const projectFilter =
    projectKeys && projectKeys.length > 0 ? ` AND project IN (${jqlProjectKeysInList(projectKeys)})` : "";

  const accountId = await resolveAccountId(site, email, token, atlassianEmail);
  if (!accountId) {
    console.error("[JiraDashboardTickets] Could not resolve Atlassian account ID for:", atlassianEmail);
    return [];
  }

  const jql = `assignee = "${accountId}" AND (statusCategory = "To Do" OR statusCategory = "In Progress")${projectFilter} ORDER BY updated DESC`;

  const res = await fetch(`${baseUrl}/rest/api/3/search/jql`, {
    method: "POST",
    headers: { ...hdrs, "Content-Type": "application/json" },
    body: JSON.stringify({ jql, maxResults: 50, fields: ["summary", "status", "priority", "issuetype", "updated"] }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[JiraDashboardTickets] search failed:", res.status, body);
    return [];
  }

  const data = await res.json();
  const issues: {
    id: string;
    key: string;
    fields: {
      summary: string;
      status: { name: string; statusCategory: { key: string } };
      priority: { name: string };
      issuetype: { name: string };
      updated: string;
    };
  }[] = data.issues ?? [];

  const tickets: JiraTicket[] = issues.map((issue) => ({
    id: issue.id,
    key: issue.key,
    title: issue.fields.summary,
    status: issue.fields.status.name,
    statusCategory: jiraStatusCategoryFromApi(issue.fields.status.statusCategory.key),
    priority: mapPriority(issue.fields.priority.name),
    type: issue.fields.issuetype.name,
    updatedAt: issue.fields.updated,
    updatedAgo: timeAgo(issue.fields.updated),
    url: `${baseUrl}/browse/${issue.key}`,
  }));

  tickets.sort((a, b) => {
    const ap = a.statusCategory === "in_progress" ? 0 : 1;
    const bp = b.statusCategory === "in_progress" ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return tickets;
}

// ---------- Jira Notifications (assigned to me or watched by me, recently updated) ----------

export async function fetchJiraAssignedOrWatchedUpdatedTickets(
  site: string,
  email: string,
  token: string,
  projectKeys?: string[],
  days = 7,
): Promise<JiraTicket[]> {
  if (projectKeys !== undefined && projectKeys.length === 0) return [];

  const baseUrl = `https://${site}.atlassian.net`;
  const hdrs = headers(email, token);

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);
  const since = sinceDate.toISOString().split("T")[0];

  const projectFilter =
    projectKeys && projectKeys.length > 0 ? ` AND project IN (${jqlProjectKeysInList(projectKeys)})` : "";

  const jql =
    `(assignee = currentUser() OR watcher = currentUser()) ` +
    `AND statusCategory != Done AND updated >= "${since}"${projectFilter} ORDER BY updated DESC`;

  const res = await fetch(`${baseUrl}/rest/api/3/search/jql`, {
    method: "POST",
    headers: { ...hdrs, "Content-Type": "application/json" },
    body: JSON.stringify({ jql, maxResults: 30, fields: ["summary", "status", "priority", "issuetype", "updated"] }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[JiraNotificationTickets] search failed:", res.status, body);
    return [];
  }

  const data = await res.json();
  const issues: {
    id: string;
    key: string;
    fields: {
      summary: string;
      status: { name: string; statusCategory: { key: string } };
      priority: { name: string };
      issuetype: { name: string };
      updated: string;
    };
  }[] = data.issues ?? [];

  return issues.map((issue) => ({
    id: issue.id,
    key: issue.key,
    title: issue.fields.summary,
    status: issue.fields.status.name,
    statusCategory: jiraStatusCategoryFromApi(issue.fields.status.statusCategory.key),
    priority: mapPriority(issue.fields.priority.name),
    type: issue.fields.issuetype.name,
    updatedAt: issue.fields.updated,
    updatedAgo: timeAgo(issue.fields.updated),
    url: `${baseUrl}/browse/${issue.key}`,
  }));
}

// ---------- Completed Ticket Count (for ticket velocity) ----------

export async function fetchCompletedTicketCount(
  site: string,
  email: string,
  token: string,
  atlassianEmail: string,
  projectKeys?: string[],
  days = 30,
): Promise<number> {
  if (projectKeys !== undefined && projectKeys.length === 0) return 0;

  const baseUrl = `https://${site}.atlassian.net`;

  const accountId = await resolveAccountId(site, email, token, atlassianEmail);
  if (!accountId) return 0;

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);
  const since = sinceDate.toISOString().split("T")[0];

  const projectFilter =
    projectKeys && projectKeys.length > 0 ? ` AND project IN (${jqlProjectKeysInList(projectKeys)})` : "";

  // Use "status changed" + date filter — "resolved" field may not be set on all instances
  const jql = `assignee = "${accountId}" AND statusCategory = Done AND updated >= "${since}"${projectFilter}`;
  console.log("[CompletedTickets] JQL:", jql);

  const res = await fetch(`${baseUrl}/rest/api/3/search/jql`, {
    method: "POST",
    headers: { ...headers(email, token), "Content-Type": "application/json" },
    body: JSON.stringify({ jql, maxResults: 100, fields: ["summary"] }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[CompletedTickets] search failed:", res.status, body);
    return 0;
  }

  const data = await res.json();
  console.log("[CompletedTickets] response keys:", Object.keys(data), "total:", data.total, "issues length:", data.issues?.length);
  // Log first 200 chars of response if no issues found for debugging
  if (!data.issues && !data.total) {
    console.log("[CompletedTickets] unexpected response:", JSON.stringify(data).slice(0, 300));
  }
  // New /search/jql endpoint may not return `total` — count from issues array
  if (typeof data.total === "number") return data.total;
  return data.issues?.length ?? 0;
}

// ---------- Atlassian Account Lookup ----------

const accountIdCache = new Map<string, string>();

async function resolveAccountId(
  site: string,
  email: string,
  token: string,
  lookupEmail: string,
): Promise<string | null> {
  const cacheKey = `${site}:${lookupEmail}`;
  if (accountIdCache.has(cacheKey)) return accountIdCache.get(cacheKey)!;

  const baseUrl = `https://${site}.atlassian.net`;
  const hdrs = headers(email, token);

  // Try /user/picker first — most reliable for email-based lookup
  try {
    const pickerRes = await fetch(
      `${baseUrl}/rest/api/3/user/picker?query=${encodeURIComponent(lookupEmail)}&maxResults=1`,
      { headers: hdrs },
    );
    if (pickerRes.ok) {
      const pickerData = await pickerRes.json();
      const users: { accountId: string; html?: string; displayName?: string }[] = pickerData.users ?? [];
      if (users.length > 0) {
        accountIdCache.set(cacheKey, users[0].accountId);
        return users[0].accountId;
      }
    }
  } catch {
    // fall through to next attempt
  }

  // Fallback: /user/search
  try {
    const res = await fetch(
      `${baseUrl}/rest/api/3/user/search?query=${encodeURIComponent(lookupEmail)}&maxResults=5`,
      { headers: hdrs },
    );
    if (res.ok) {
      const users: { accountId: string; emailAddress?: string; displayName?: string }[] = await res.json();
      if (users.length > 0) {
        accountIdCache.set(cacheKey, users[0].accountId);
        return users[0].accountId;
      }
    }
  } catch {
    // fall through
  }

  console.error("[resolveAccountId] Could not resolve account ID for:", lookupEmail);
  return null;
}

// ---------- Confluence ----------

interface ConfluenceResult {
  id: string;
  title: string;
  type: string;
  _links: { webui: string };
  version?: { when: string; number?: number };
  history?: { lastUpdated: { when: string } };
}

interface ConfluenceSearchResponse {
  results: ConfluenceResult[];
  size: number;
}

export async function fetchConfluenceDocs(
  site: string,
  email: string,
  token: string,
  atlassianEmail: string,
  spaceKeys?: string[],
): Promise<ConfluenceDoc[]> {
  if (spaceKeys !== undefined && spaceKeys.length === 0) return [];

  const baseUrl = `https://${site}.atlassian.net/wiki`;
  const hdrs = headers(email, token);

  // Resolve account ID — Confluence CQL requires accountId, not email
  const accountId = await resolveAccountId(site, email, token, atlassianEmail);
  if (!accountId) {
    console.error("Could not resolve Atlassian account ID for:", atlassianEmail);
    return [];
  }

  const spaceFilter = spaceKeys && spaceKeys.length > 0
    ? ` AND space IN (${spaceKeys.map((k) => `"${k}"`).join(",")})`
    : "";
  const cql = `contributor = "${accountId}" AND type = page${spaceFilter} ORDER BY lastmodified DESC`;
  const res = await fetch(
    `${baseUrl}/rest/api/content/search?cql=${encodeURIComponent(cql)}&limit=10&expand=version,space`,
    { headers: hdrs },
  );

  if (!res.ok) {
    console.error("Confluence docs search failed:", res.status, await res.text().catch(() => ""));
    return [];
  }

  const data = await res.json();
  const results: { id: string; title: string; version?: { number: number }; _links?: { webui?: string } }[] = data.results ?? [];

  const docs = await Promise.all(
    results.map(async (page) => {
      const edits = page.version?.number ?? 0;
      let reads = 0;
      try {
        const analyticsRes = await fetch(
          `${baseUrl}/rest/api/analytics/content/${page.id}/views`,
          { headers: hdrs },
        );
        if (analyticsRes.ok) {
          const analytics = await analyticsRes.json();
          reads = analytics.count ?? 0;
        }
      } catch {
        // Views API may not be available
      }
      return {
        title: page.title,
        reads,
        edits,
        url: page._links?.webui ? `${baseUrl}${page._links.webui}` : `${baseUrl}/pages/${page.id}`,
      };
    }),
  );

  return docs;
}

export async function fetchConfluenceActivity(
  site: string,
  email: string,
  token: string,
  atlassianEmail: string,
  spaceKeys?: string[],
): Promise<ConfluenceActivity[]> {
  if (spaceKeys !== undefined && spaceKeys.length === 0) return [];

  const baseUrl = `https://${site}.atlassian.net/wiki`;

  // Resolve account ID — Confluence CQL requires accountId, not email
  const accountId = await resolveAccountId(site, email, token, atlassianEmail);
  if (!accountId) return [];

  const spaceFilter = spaceKeys && spaceKeys.length > 0
    ? ` AND space IN (${spaceKeys.map((k) => `"${k}"`).join(",")})`
    : "";
  const cql = `contributor = "${accountId}" AND type = page${spaceFilter} ORDER BY lastmodified DESC`;
  const res = await fetch(
    `${baseUrl}/rest/api/content/search?cql=${encodeURIComponent(cql)}&limit=5&expand=version,space,history.lastUpdated`,
    { headers: headers(email, token) },
  );

  if (!res.ok) return [];

  const data: ConfluenceSearchResponse = await res.json();
  return data.results.map((page) => {
    const when = page.version?.when ?? page.history?.lastUpdated?.when ?? new Date().toISOString();
    return {
      type: "edit" as const,
      pageTitle: page.title,
      description: `Updated ${page.title}`,
      timeAgo: timeAgo(when),
      updatedAt: when,
      url: page._links?.webui ? `${baseUrl}${page._links.webui}` : `${baseUrl}/pages/${page.id}`,
    };
  });
}
