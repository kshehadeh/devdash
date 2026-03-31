import Database from "better-sqlite3";
import { createTestDb } from "../helpers/test-db";
import { _setDbForTesting } from "../../db/index";
import { saveConnection } from "../../db/connections";
import { createDeveloper } from "../../db/developers";
import { createSource, addSourceToDeveloper } from "../../db/sources";
import { syncLinearIssues } from "../../sync/linear-sync";

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
  _setDbForTesting(db);
});

afterEach(() => {
  _setDbForTesting(null);
  db.close();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupLinearDev(opts?: { skipConnection?: boolean; skipSources?: boolean }) {
  const dev = createDeveloper({
    name: "Test User",
    role: "Engineer",
    team: "Platform",
    atlassianEmail: "test@company.com", // sets work email via mergeLegacyIdentityFromDeveloper
  });

  if (!opts?.skipConnection) {
    saveConnection("linear", {
      token: "lin_api_test-token",
      connected: true,
    });
  }

  if (!opts?.skipSources) {
    const teamSource = createSource({
      type: "linear_team",
      name: "Frontend",
      org: "my-workspace",
      identifier: "team-uuid-1",
    });
    addSourceToDeveloper(dev.id, teamSource.id);
  }

  return dev;
}

function mockLinearGraphQL(issues: Array<{
  id: string;
  identifier: string;
  title: string;
  updatedAt: string;
  state: { name: string; type: string };
  team: { id: string; key: string } | null;
}>) {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        data: {
          issues: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: issues,
          },
        },
      }),
    text: () => Promise.resolve(""),
  });
  global.fetch = mockFetch;
  return mockFetch;
}

// ---------------------------------------------------------------------------
// syncLinearIssues
// ---------------------------------------------------------------------------

describe("syncLinearIssues", () => {
  it("fetches Linear issues and caches them with correct fields", async () => {
    const dev = setupLinearDev();

    mockLinearGraphQL([
      {
        id: "issue-1",
        identifier: "FE-101",
        title: "Implement search",
        updatedAt: "2026-03-15T10:00:00.000Z",
        state: { name: "In Progress", type: "started" },
        team: { id: "team-uuid-1", key: "FE" },
      },
      {
        id: "issue-2",
        identifier: "FE-102",
        title: "Fix tooltip",
        updatedAt: "2026-03-14T08:00:00.000Z",
        state: { name: "Todo", type: "unstarted" },
        team: { id: "team-uuid-1", key: "FE" },
      },
    ]);

    await syncLinearIssues(dev.id);

    const issues = db
      .prepare("SELECT * FROM cached_linear_issues WHERE developer_id = ? ORDER BY identifier")
      .all(dev.id) as {
      issue_id: string;
      identifier: string;
      title: string;
      state_name: string;
      state_type: string;
      team_key: string;
      team_id: string;
      updated_at: string;
    }[];

    expect(issues).toHaveLength(2);

    expect(issues[0]).toMatchObject({
      issue_id: "issue-1",
      identifier: "FE-101",
      title: "Implement search",
      state_name: "In Progress",
      state_type: "started",
      team_key: "FE",
      team_id: "team-uuid-1",
    });

    expect(issues[1]).toMatchObject({
      issue_id: "issue-2",
      identifier: "FE-102",
      title: "Fix tooltip",
      state_name: "Todo",
      state_type: "unstarted",
    });

    const syncLog = db
      .prepare("SELECT * FROM sync_log WHERE developer_id = ? AND data_type = 'linear_issues'")
      .get(dev.id) as { status: string };
    expect(syncLog.status).toBe("ok");
  });

  it("clears cache when no Linear connection", async () => {
    const dev = setupLinearDev({ skipConnection: true });

    // Pre-seed cached issue to verify it gets cleared
    db.prepare(
      "INSERT INTO cached_linear_issues (developer_id, issue_id, identifier, title, state_name, state_type, team_key, team_id, updated_at) VALUES (?, 'old', 'OLD-1', 'old issue', 'Done', 'completed', 'OLD', 'old-team', '2025-01-01')",
    ).run(dev.id);

    await syncLinearIssues(dev.id);

    const issues = db
      .prepare("SELECT * FROM cached_linear_issues WHERE developer_id = ?")
      .all(dev.id);
    expect(issues).toHaveLength(0);

    const syncLog = db
      .prepare("SELECT * FROM sync_log WHERE developer_id = ? AND data_type = 'linear_issues'")
      .get(dev.id) as { status: string };
    expect(syncLog.status).toBe("ok");
  });

  it("clears cache when no team sources assigned", async () => {
    const dev = setupLinearDev({ skipSources: true });

    // Pre-seed cached issue
    db.prepare(
      "INSERT INTO cached_linear_issues (developer_id, issue_id, identifier, title, state_name, state_type, team_key, team_id, updated_at) VALUES (?, 'old', 'OLD-1', 'old issue', 'Done', 'completed', 'OLD', 'old-team', '2025-01-01')",
    ).run(dev.id);

    await syncLinearIssues(dev.id);

    const issues = db
      .prepare("SELECT * FROM cached_linear_issues WHERE developer_id = ?")
      .all(dev.id);
    expect(issues).toHaveLength(0);

    const syncLog = db
      .prepare("SELECT * FROM sync_log WHERE developer_id = ? AND data_type = 'linear_issues'")
      .get(dev.id) as { status: string; last_cursor: string | null };
    expect(syncLog.status).toBe("ok");
    expect(syncLog.last_cursor).toBeNull();
  });

  it("records error in sync_log on API failure", async () => {
    const dev = setupLinearDev();

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("not json")),
      text: () => Promise.resolve("Internal Server Error"),
    });

    // syncLinearIssues catches errors and logs them (does not rethrow)
    await syncLinearIssues(dev.id);

    const syncLog = db
      .prepare("SELECT * FROM sync_log WHERE developer_id = ? AND data_type = 'linear_issues'")
      .get(dev.id) as { status: string; error_message: string };
    expect(syncLog.status).toBe("error");
    expect(syncLog.error_message).toBeTruthy();
  });

  it("handles issues with null team gracefully", async () => {
    const dev = setupLinearDev();

    mockLinearGraphQL([
      {
        id: "issue-no-team",
        identifier: "X-1",
        title: "Orphan issue",
        updatedAt: "2026-03-15T10:00:00.000Z",
        state: { name: "Backlog", type: "backlog" },
        team: null,
      },
    ]);

    await syncLinearIssues(dev.id);

    const issues = db
      .prepare("SELECT * FROM cached_linear_issues WHERE developer_id = ?")
      .all(dev.id) as { issue_id: string; team_key: string | null; team_id: string | null }[];

    expect(issues).toHaveLength(1);
    expect(issues[0].team_key).toBeNull();
    expect(issues[0].team_id).toBeNull();
  });

  it("handles issues with missing state gracefully", async () => {
    const dev = setupLinearDev();

    // Simulate an issue where state is undefined/null
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            issues: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [
                {
                  id: "issue-no-state",
                  identifier: "FE-200",
                  title: "Stateless issue",
                  updatedAt: "2026-03-15T10:00:00.000Z",
                  state: null,
                  team: { id: "team-uuid-1", key: "FE" },
                },
              ],
            },
          },
        }),
      text: () => Promise.resolve(""),
    });

    await syncLinearIssues(dev.id);

    const issues = db
      .prepare("SELECT * FROM cached_linear_issues WHERE developer_id = ?")
      .all(dev.id) as { state_name: string; state_type: string }[];

    expect(issues).toHaveLength(1);
    expect(issues[0].state_name).toBe("");
    expect(issues[0].state_type).toBe("unstarted");
  });
});
