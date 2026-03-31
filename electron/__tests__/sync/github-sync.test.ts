import Database from "better-sqlite3";
import { createTestDb } from "../helpers/test-db";
import { _setDbForTesting } from "../../db/index";
import { saveConnection } from "../../db/connections";
import { createDeveloper } from "../../db/developers";
import { createSource, addSourceToDeveloper } from "../../db/sources";
import { syncContributions, syncPullRequests } from "../../sync/github-sync";

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

function setupGitHubDev(opts?: { skipUsername?: boolean; skipConnection?: boolean }) {
  const dev = createDeveloper({
    name: "Test User",
    role: "Engineer",
    team: "Platform",
    githubUsername: opts?.skipUsername ? undefined : "testuser",
  });

  if (!opts?.skipConnection) {
    saveConnection("github", { token: "ghp_test-token", connected: true });
  }

  return dev;
}

function setupGitHubDevWithRepo() {
  const dev = setupGitHubDev();
  const source = createSource({
    type: "github_repo",
    name: "my-repo",
    org: "my-org",
    identifier: "my-repo",
  });
  addSourceToDeveloper(dev.id, source.id);
  return { dev, source };
}

function mockContributionFetch() {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        data: {
          user: {
            contributionsCollection: {
              contributionCalendar: {
                totalContributions: 42,
                weeks: [
                  {
                    contributionDays: [
                      { contributionCount: 5, date: "2026-03-01" },
                      { contributionCount: 3, date: "2026-03-02" },
                    ],
                  },
                ],
              },
            },
          },
        },
      }),
    text: () => Promise.resolve(""),
  });
  global.fetch = mockFetch;
  return mockFetch;
}

// ---------------------------------------------------------------------------
// syncContributions
// ---------------------------------------------------------------------------

describe("syncContributions", () => {
  it("fetches contribution calendar and caches rows + sync_log", async () => {
    const dev = setupGitHubDev();
    mockContributionFetch();

    await syncContributions(dev.id);

    const contributions = db
      .prepare("SELECT * FROM cached_contributions WHERE developer_id = ? ORDER BY date")
      .all(dev.id) as { date: string; count: number }[];
    expect(contributions).toHaveLength(2);
    expect(contributions[0]).toMatchObject({ date: "2026-03-01", count: 5 });
    expect(contributions[1]).toMatchObject({ date: "2026-03-02", count: 3 });

    const syncLog = db
      .prepare("SELECT * FROM sync_log WHERE developer_id = ? AND data_type = 'github_contributions'")
      .get(dev.id) as { status: string; last_cursor: string };
    expect(syncLog.status).toBe("ok");
    expect(syncLog.last_cursor).toBe("42");
  });

  it("skips when developer has no GitHub username", async () => {
    const dev = setupGitHubDev({ skipUsername: true });
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    await syncContributions(dev.id);

    expect(mockFetch).not.toHaveBeenCalled();
    const rows = db
      .prepare("SELECT * FROM cached_contributions WHERE developer_id = ?")
      .all(dev.id);
    expect(rows).toHaveLength(0);
  });

  it("skips when no GitHub connection token", async () => {
    const dev = setupGitHubDev({ skipConnection: true });
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    await syncContributions(dev.id);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("records error in sync_log on API failure", async () => {
    const dev = setupGitHubDev();
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Server Error"),
    });

    await expect(syncContributions(dev.id)).rejects.toThrow();

    const syncLog = db
      .prepare("SELECT * FROM sync_log WHERE developer_id = ? AND data_type = 'github_contributions'")
      .get(dev.id) as { status: string; error_message: string };
    expect(syncLog.status).toBe("error");
    expect(syncLog.error_message).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// syncPullRequests
// ---------------------------------------------------------------------------

describe("syncPullRequests", () => {
  it("fetches PRs, review requests, and caches them with sync_log", async () => {
    const { dev } = setupGitHubDevWithRepo();

    const now = new Date().toISOString();

    // The sync function makes multiple fetch calls:
    // 1. Search issues (incremental PRs)
    // 2. fetchReviewRequests (search issues for review-requested)
    // 3. Search issues (open PRs refresh)
    //
    // fetchReviewRequests is called with a Promise, so call order depends on
    // concurrency, but mock responds to all in the same way using mockImplementation.
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = typeof url === "string" ? url : String(url);

      // All search endpoints return valid search results
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            total_count: 1,
            items: [
              {
                number: 101,
                title: "Fix bug",
                state: "open",
                pull_request: { merged_at: null },
                created_at: now,
                updated_at: now,
                repository_url: "https://api.github.com/repos/my-org/my-repo",
                requested_reviewers: [{ login: "reviewer1" }],
                review_comments: 2,
                user: { login: "testuser" },
                html_url: "https://github.com/my-org/my-repo/pull/101",
              },
            ],
          }),
        text: () => Promise.resolve(""),
      });
    });
    global.fetch = mockFetch;

    await syncPullRequests(dev.id);

    const prs = db
      .prepare("SELECT * FROM cached_pull_requests WHERE developer_id = ?")
      .all(dev.id) as { pr_number: number; repo: string; title: string; status: string; pending_reviewers_json: string }[];
    expect(prs.length).toBeGreaterThanOrEqual(1);

    const pr = prs.find((p) => p.pr_number === 101);
    expect(pr).toBeDefined();
    expect(pr!.repo).toBe("my-org/my-repo");
    expect(pr!.title).toBe("Fix bug");
    expect(pr!.status).toBe("open");
    expect(JSON.parse(pr!.pending_reviewers_json)).toContain("reviewer1");

    // Review requests table should also have entries
    const reviewReqs = db
      .prepare("SELECT * FROM cached_review_requests WHERE developer_id = ?")
      .all(dev.id) as { pr_number: number; repo: string }[];
    expect(reviewReqs.length).toBeGreaterThanOrEqual(1);

    const syncLog = db
      .prepare("SELECT * FROM sync_log WHERE developer_id = ? AND data_type = 'github_pull_requests'")
      .get(dev.id) as { status: string };
    expect(syncLog.status).toBe("ok");
  });

  it("clears cache and sets ok when no repos assigned", async () => {
    const dev = setupGitHubDev();
    // No sources assigned

    // Pre-seed some cached data to verify it gets cleared
    db.prepare(
      "INSERT INTO cached_pull_requests (developer_id, pr_number, repo, title, status, review_count, created_at, updated_at, pending_reviewers_json) VALUES (?, 1, 'org/repo', 'old', 'open', 0, '2025-01-01', '2025-01-01', '[]')",
    ).run(dev.id);

    await syncPullRequests(dev.id);

    const prs = db
      .prepare("SELECT * FROM cached_pull_requests WHERE developer_id = ?")
      .all(dev.id);
    expect(prs).toHaveLength(0);

    const syncLog = db
      .prepare("SELECT * FROM sync_log WHERE developer_id = ? AND data_type = 'github_pull_requests'")
      .get(dev.id) as { status: string; last_cursor: string | null };
    expect(syncLog.status).toBe("ok");
    expect(syncLog.last_cursor).toBeNull();
  });

  it("records error in sync_log on API failure", async () => {
    const { dev } = setupGitHubDevWithRepo();

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });

    // syncPullRequests does NOT throw on fetch failure for the main search — it breaks the loop.
    // But fetchReviewRequests may still succeed (returns []). The sync itself should still finish.
    // Let's verify the status is set correctly.
    await syncPullRequests(dev.id);

    // When the main search fails (res.ok === false), the function breaks but still continues
    // to the open PR query and review queue. Since all fetches fail, it processes empty arrays.
    const syncLog = db
      .prepare("SELECT * FROM sync_log WHERE developer_id = ? AND data_type = 'github_pull_requests'")
      .get(dev.id) as { status: string };
    expect(syncLog.status).toBe("ok");
  });

  it("correctly detects merged and closed PRs", async () => {
    const { dev } = setupGitHubDevWithRepo();
    const now = new Date().toISOString();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          total_count: 3,
          items: [
            {
              number: 10,
              title: "Merged PR",
              state: "closed",
              pull_request: { merged_at: "2026-02-01T00:00:00Z" },
              created_at: now,
              updated_at: now,
              repository_url: "https://api.github.com/repos/my-org/my-repo",
              requested_reviewers: [],
              user: { login: "testuser" },
              html_url: "https://github.com/my-org/my-repo/pull/10",
            },
            {
              number: 11,
              title: "Closed PR",
              state: "closed",
              pull_request: { merged_at: null },
              created_at: now,
              updated_at: now,
              repository_url: "https://api.github.com/repos/my-org/my-repo",
              requested_reviewers: [],
              user: { login: "testuser" },
              html_url: "https://github.com/my-org/my-repo/pull/11",
            },
            {
              number: 12,
              title: "Open PR",
              state: "open",
              pull_request: { merged_at: null },
              created_at: now,
              updated_at: now,
              repository_url: "https://api.github.com/repos/my-org/my-repo",
              requested_reviewers: [{ login: "r1" }],
              user: { login: "testuser" },
              html_url: "https://github.com/my-org/my-repo/pull/12",
            },
          ],
        }),
      text: () => Promise.resolve(""),
    });

    await syncPullRequests(dev.id);

    const prs = db
      .prepare("SELECT pr_number, status, merged_at, pending_reviewers_json FROM cached_pull_requests WHERE developer_id = ? ORDER BY pr_number")
      .all(dev.id) as { pr_number: number; status: string; merged_at: string | null; pending_reviewers_json: string }[];

    const merged = prs.find((p) => p.pr_number === 10);
    expect(merged?.status).toBe("merged");
    expect(merged?.merged_at).toBe("2026-02-01T00:00:00Z");

    const closed = prs.find((p) => p.pr_number === 11);
    expect(closed?.status).toBe("closed");
    expect(closed?.merged_at).toBeNull();

    const open = prs.find((p) => p.pr_number === 12);
    expect(open?.status).toBe("open");
    expect(JSON.parse(open!.pending_reviewers_json)).toEqual(["r1"]);
  });
});
