import Database from "better-sqlite3";
import { createTestDb } from "../helpers/test-db";
import { _setDbForTesting } from "../../db/index";
import { saveConnection } from "../../db/connections";
import { createDeveloper } from "../../db/developers";
import { createSource, addSourceToDeveloper } from "../../db/sources";
import { syncJiraTickets, syncConfluencePages } from "../../sync/atlassian-sync";

let db: Database.Database;

// Each test gets a unique email so the module-level accountIdCache in
// atlassian-sync.ts never returns a stale hit from a previous test.
let emailSeq = 0;

beforeEach(() => {
  db = createTestDb();
  _setDbForTesting(db);
  emailSeq++;
});

afterEach(() => {
  _setDbForTesting(null);
  db.close();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uniqueEmail() {
  return `user-${emailSeq}-${Date.now()}@company.com`;
}

function setupAtlassianDev(opts?: { skipSources?: boolean; sourceType?: "jira_project" | "confluence_space" }) {
  const email = uniqueEmail();
  const dev = createDeveloper({
    name: "Test User",
    role: "Engineer",
    team: "Platform",
    atlassianEmail: email,
  });

  saveConnection("atlassian", {
    token: "atl-token",
    email: "admin@company.com",
    org: "mysite",
    connected: true,
  });

  if (!opts?.skipSources) {
    const type = opts?.sourceType ?? "jira_project";
    if (type === "jira_project") {
      const jiraSource = createSource({
        type: "jira_project",
        name: "My Project",
        org: "mysite",
        identifier: "MP",
      });
      addSourceToDeveloper(dev.id, jiraSource.id);
    } else {
      const confSource = createSource({
        type: "confluence_space",
        name: "Engineering",
        org: "mysite",
        identifier: "ENG",
      });
      addSourceToDeveloper(dev.id, confSource.id);
    }
  }

  return dev;
}

/** URL-based mock fetch dispatcher for Atlassian APIs. */
function mockAtlassianFetchByUrl(handlers: Record<string, {
  ok: boolean;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
  status?: number;
}>) {
  const mockFetch = vi.fn().mockImplementation((url: string) => {
    const urlStr = typeof url === "string" ? url : String(url);
    for (const [pattern, response] of Object.entries(handlers)) {
      if (urlStr.includes(pattern)) {
        return Promise.resolve({
          ok: response.ok,
          status: response.status ?? (response.ok ? 200 : 500),
          json: response.json ?? (() => Promise.resolve({})),
          text: response.text ?? (() => Promise.resolve("")),
        });
      }
    }
    // Default: not found
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}), text: () => Promise.resolve("Not Found") });
  });
  global.fetch = mockFetch;
  return mockFetch;
}

// ---------------------------------------------------------------------------
// syncJiraTickets
// ---------------------------------------------------------------------------

describe("syncJiraTickets", () => {
  it("resolves account ID and caches Jira tickets with proper fields", async () => {
    const dev = setupAtlassianDev();

    mockAtlassianFetchByUrl({
      "user/picker": {
        ok: true,
        json: () => Promise.resolve({ users: [{ accountId: "acc-123" }] }),
      },
      "search/jql": {
        ok: true,
        json: () =>
          Promise.resolve({
            issues: [
              {
                key: "MP-1",
                fields: {
                  summary: "Fix the login page",
                  status: { name: "In Progress", statusCategory: { key: "indeterminate" } },
                  priority: { name: "High" },
                  issuetype: { name: "Bug" },
                  project: { key: "MP" },
                  updated: "2026-03-15T10:00:00.000Z",
                },
              },
              {
                key: "MP-2",
                fields: {
                  summary: "Add dark mode",
                  status: { name: "To Do", statusCategory: { key: "new" } },
                  priority: { name: "Medium" },
                  issuetype: { name: "Story" },
                  project: { key: "MP" },
                  updated: "2026-03-14T10:00:00.000Z",
                },
              },
            ],
            nextPageToken: undefined,
          }),
      },
    });

    await syncJiraTickets(dev.id);

    const tickets = db
      .prepare("SELECT * FROM cached_jira_tickets WHERE developer_id = ? ORDER BY issue_key")
      .all(dev.id) as {
      issue_key: string;
      summary: string;
      status: string;
      status_category: string;
      priority: string;
      issue_type: string;
      project_key: string;
    }[];

    expect(tickets).toHaveLength(2);

    expect(tickets[0]).toMatchObject({
      issue_key: "MP-1",
      summary: "Fix the login page",
      status: "In Progress",
      status_category: "in_progress",
      priority: "high",
      issue_type: "Bug",
      project_key: "MP",
    });

    expect(tickets[1]).toMatchObject({
      issue_key: "MP-2",
      summary: "Add dark mode",
      status: "To Do",
      status_category: "todo",
      priority: "medium",
      issue_type: "Story",
    });

    const syncLog = db
      .prepare("SELECT * FROM sync_log WHERE developer_id = ? AND data_type = 'jira_tickets'")
      .get(dev.id) as { status: string; last_cursor: string };
    expect(syncLog.status).toBe("ok");
    expect(syncLog.last_cursor).toBeTruthy();
  });

  it("clears cache and sets ok when no project sources assigned", async () => {
    const dev = setupAtlassianDev({ skipSources: true });

    // Pre-seed a cached ticket to verify cleanup
    db.prepare(
      "INSERT INTO cached_jira_tickets (developer_id, issue_key, summary, status, status_category, project_key, updated_at, priority, issue_type) VALUES (?, 'OLD-1', 'old', 'Done', 'done', 'OLD', '2025-01-01', 'medium', 'Task')",
    ).run(dev.id);

    await syncJiraTickets(dev.id);

    const tickets = db
      .prepare("SELECT * FROM cached_jira_tickets WHERE developer_id = ?")
      .all(dev.id);
    expect(tickets).toHaveLength(0);

    const syncLog = db
      .prepare("SELECT * FROM sync_log WHERE developer_id = ? AND data_type = 'jira_tickets'")
      .get(dev.id) as { status: string; last_cursor: string | null };
    expect(syncLog.status).toBe("ok");
    expect(syncLog.last_cursor).toBeNull();
  });

  it("sets error when account ID cannot be resolved", async () => {
    const dev = setupAtlassianDev();

    // Both user/picker and user/search fail — use URL dispatch
    mockAtlassianFetchByUrl({
      "user/picker": { ok: false, status: 403, text: () => Promise.resolve("Forbidden") },
      "user/search": { ok: false, status: 403, text: () => Promise.resolve("Forbidden") },
    });

    await syncJiraTickets(dev.id);

    const syncLog = db
      .prepare("SELECT * FROM sync_log WHERE developer_id = ? AND data_type = 'jira_tickets'")
      .get(dev.id) as { status: string; error_message: string };
    expect(syncLog.status).toBe("error");
    expect(syncLog.error_message).toContain("account ID");
  });

  it("returns early without error when no atlassian connection", async () => {
    const dev = createDeveloper({
      name: "No Connection",
      role: "Engineer",
      team: "T",
      atlassianEmail: "test@company.com",
    });
    // No connection saved — getAtlassianContextForValidation returns null

    await syncJiraTickets(dev.id);

    const syncLog = db
      .prepare("SELECT * FROM sync_log WHERE developer_id = ? AND data_type = 'jira_tickets'")
      .get(dev.id);
    expect(syncLog).toBeUndefined();
  });

  it("maps Jira priority levels correctly", async () => {
    const dev = setupAtlassianDev();

    mockAtlassianFetchByUrl({
      "user/picker": {
        ok: true,
        json: () => Promise.resolve({ users: [{ accountId: "acc-1" }] }),
      },
      "search/jql": {
        ok: true,
        json: () =>
          Promise.resolve({
            issues: [
              {
                key: "MP-10",
                fields: {
                  summary: "Critical bug",
                  status: { name: "Open", statusCategory: { key: "new" } },
                  priority: { name: "Highest" },
                  issuetype: { name: "Bug" },
                  project: { key: "MP" },
                  updated: "2026-03-15T10:00:00.000Z",
                },
              },
              {
                key: "MP-11",
                fields: {
                  summary: "Low priority",
                  status: { name: "Open", statusCategory: { key: "new" } },
                  priority: { name: "Lowest" },
                  issuetype: { name: "Task" },
                  project: { key: "MP" },
                  updated: "2026-03-15T10:00:00.000Z",
                },
              },
              {
                key: "MP-12",
                fields: {
                  summary: "No priority",
                  status: { name: "Open", statusCategory: { key: "new" } },
                  priority: null,
                  issuetype: null,
                  project: { key: "MP" },
                  updated: "2026-03-15T10:00:00.000Z",
                },
              },
            ],
            nextPageToken: undefined,
          }),
      },
    });

    await syncJiraTickets(dev.id);

    const tickets = db
      .prepare("SELECT issue_key, priority, issue_type FROM cached_jira_tickets WHERE developer_id = ? ORDER BY issue_key")
      .all(dev.id) as { issue_key: string; priority: string; issue_type: string }[];

    expect(tickets.find((t) => t.issue_key === "MP-10")?.priority).toBe("critical");
    expect(tickets.find((t) => t.issue_key === "MP-11")?.priority).toBe("low");
    expect(tickets.find((t) => t.issue_key === "MP-12")?.priority).toBe("medium");
    expect(tickets.find((t) => t.issue_key === "MP-12")?.issue_type).toBe("Task");
  });
});

// ---------------------------------------------------------------------------
// syncConfluencePages
// ---------------------------------------------------------------------------

describe("syncConfluencePages", () => {
  it("caches Confluence pages with view counts", async () => {
    const dev = setupAtlassianDev({ sourceType: "confluence_space" });

    global.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = typeof url === "string" ? url : String(url);

      // Account ID resolution
      if (urlStr.includes("user/picker")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ users: [{ accountId: "acc-456" }] }),
          text: () => Promise.resolve(""),
        });
      }

      // CQL content search
      if (urlStr.includes("content/search")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              results: [
                {
                  id: "page-1",
                  title: "Architecture Doc",
                  version: { number: 5 },
                  space: { key: "ENG" },
                  history: { lastUpdated: { when: "2026-03-10T12:00:00Z" } },
                  _links: { webui: "/pages/page-1" },
                },
                {
                  id: "page-2",
                  title: "Runbook",
                  version: { number: 2 },
                  space: { key: "ENG" },
                  history: { lastUpdated: { when: "2026-03-08T09:00:00Z" } },
                  _links: { webui: "/pages/page-2" },
                },
              ],
            }),
          text: () => Promise.resolve(""),
        });
      }

      // Analytics view counts (one per page)
      if (urlStr.includes("analytics/content")) {
        const viewCount = urlStr.includes("page-1") ? 150 : 42;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ count: viewCount }),
          text: () => Promise.resolve(""),
        });
      }

      return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve("Not Found"), json: () => Promise.resolve({}) });
    });

    await syncConfluencePages(dev.id);

    const pages = db
      .prepare("SELECT * FROM cached_confluence_pages WHERE developer_id = ? ORDER BY page_id")
      .all(dev.id) as {
      page_id: string;
      title: string;
      space_key: string;
      version_count: number;
      view_count: number;
    }[];

    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatchObject({
      page_id: "page-1",
      title: "Architecture Doc",
      space_key: "ENG",
      version_count: 5,
      view_count: 150,
    });
    expect(pages[1]).toMatchObject({
      page_id: "page-2",
      title: "Runbook",
      space_key: "ENG",
      version_count: 2,
      view_count: 42,
    });

    const syncLog = db
      .prepare("SELECT * FROM sync_log WHERE developer_id = ? AND data_type = 'confluence_pages'")
      .get(dev.id) as { status: string };
    expect(syncLog.status).toBe("ok");
  });

  it("clears cache when no space sources assigned", async () => {
    const dev = setupAtlassianDev({ skipSources: true });

    // Pre-seed cached page
    db.prepare(
      "INSERT INTO cached_confluence_pages (developer_id, page_id, title, space_key, version_count, view_count, last_modified) VALUES (?, 'old-page', 'Old', 'OLD', 1, 0, '2025-01-01')",
    ).run(dev.id);

    await syncConfluencePages(dev.id);

    const pages = db
      .prepare("SELECT * FROM cached_confluence_pages WHERE developer_id = ?")
      .all(dev.id);
    expect(pages).toHaveLength(0);

    const syncLog = db
      .prepare("SELECT * FROM sync_log WHERE developer_id = ? AND data_type = 'confluence_pages'")
      .get(dev.id) as { status: string };
    expect(syncLog.status).toBe("ok");
  });

  it("sets error when account ID cannot be resolved", async () => {
    const dev = setupAtlassianDev({ sourceType: "confluence_space" });

    mockAtlassianFetchByUrl({
      "user/picker": { ok: false, status: 403 },
      "user/search": { ok: false, status: 403 },
    });

    await syncConfluencePages(dev.id);

    const syncLog = db
      .prepare("SELECT * FROM sync_log WHERE developer_id = ? AND data_type = 'confluence_pages'")
      .get(dev.id) as { status: string; error_message: string };
    expect(syncLog.status).toBe("error");
    expect(syncLog.error_message).toContain("account ID");
  });
});
