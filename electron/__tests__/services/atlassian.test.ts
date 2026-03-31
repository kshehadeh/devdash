import { fetchJiraTickets, fetchConfluenceDocs } from "../../services/atlassian";

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch;
});

// ---------------------------------------------------------------------------
// fetchJiraTickets
// ---------------------------------------------------------------------------

describe("fetchJiraTickets", () => {
  const site = "test-site-jira";
  const email = "api@example.com";
  const token = "api-token";

  function mockAccountIdResolution(accountId = "acc-123") {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ users: [{ accountId }] }),
    });
  }

  function mockJiraSearchResponse(
    issues: Record<string, unknown>[] = [],
    total = issues.length,
  ) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ issues, total }),
    });
  }

  it("maps Jira API response fields correctly", async () => {
    // Use a unique atlassianEmail to avoid cache collisions
    const atlassianEmail = "tickets-map@example.com";
    mockAccountIdResolution("acc-map-1");
    mockJiraSearchResponse([
      {
        id: "10001",
        key: "PROJ-1",
        fields: {
          summary: "Fix login bug",
          status: { name: "In Progress", statusCategory: { key: "indeterminate" } },
          priority: { name: "High" },
          issuetype: { name: "Bug" },
          updated: "2024-06-01T12:00:00Z",
        },
      },
    ]);

    const result = await fetchJiraTickets(site, email, token, atlassianEmail);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "10001",
      key: "PROJ-1",
      title: "Fix login bug",
      status: "In Progress",
      statusCategory: "in_progress",
      priority: "high",
      type: "Bug",
      updatedAt: "2024-06-01T12:00:00Z",
      url: `https://${site}.atlassian.net/browse/PROJ-1`,
    });
    expect(result[0].updatedAgo).toBeDefined();
  });

  it("returns [] when projectKeys is empty array", async () => {
    const result = await fetchJiraTickets(
      site,
      email,
      token,
      "empty-keys@example.com",
      [],
    );
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns [] on failed API call", async () => {
    const atlassianEmail = "tickets-fail@example.com";
    mockAccountIdResolution("acc-fail-1");
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });

    const result = await fetchJiraTickets(site, email, token, atlassianEmail);
    expect(result).toEqual([]);
  });

  it("returns [] when account ID cannot be resolved", async () => {
    const atlassianEmail = "unresolvable@example.com";
    // user/picker returns no users
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ users: [] }),
    });
    // user/search fallback also returns no users
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    const result = await fetchJiraTickets(site, email, token, atlassianEmail);
    expect(result).toEqual([]);
  });

  it("handles multiple issues with different statuses", async () => {
    const atlassianEmail = "tickets-multi@example.com";
    mockAccountIdResolution("acc-multi-1");
    mockJiraSearchResponse([
      {
        id: "10002",
        key: "PROJ-2",
        fields: {
          summary: "Task A",
          status: { name: "To Do", statusCategory: { key: "new" } },
          priority: { name: "Low" },
          issuetype: { name: "Task" },
          updated: "2024-06-02T08:00:00Z",
        },
      },
      {
        id: "10003",
        key: "PROJ-3",
        fields: {
          summary: "Task B",
          status: { name: "Done", statusCategory: { key: "done" } },
          priority: { name: "Critical" },
          issuetype: { name: "Story" },
          updated: "2024-06-03T10:00:00Z",
        },
      },
    ]);

    const result = await fetchJiraTickets(site, email, token, atlassianEmail);
    expect(result).toHaveLength(2);
    expect(result[0].statusCategory).toBe("todo");
    expect(result[0].priority).toBe("low");
    expect(result[1].statusCategory).toBe("done");
    expect(result[1].priority).toBe("critical");
  });
});

// ---------------------------------------------------------------------------
// fetchConfluenceDocs
// ---------------------------------------------------------------------------

describe("fetchConfluenceDocs", () => {
  const site = "test-site-confluence";
  const email = "api@example.com";
  const token = "api-token";

  function mockAccountIdResolution(accountId = "acc-conf-1") {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ users: [{ accountId }] }),
    });
  }

  it("returns ConfluenceDoc[] with correct fields", async () => {
    const atlassianEmail = "confluence-docs@example.com";
    mockAccountIdResolution("acc-conf-docs-1");

    // CQL search response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [
            {
              id: "page-1",
              title: "Architecture Guide",
              version: { number: 5 },
              _links: { webui: "/wiki/spaces/ENG/pages/page-1" },
            },
          ],
          size: 1,
        }),
    });

    // Analytics per page
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ count: 42 }),
    });

    const result = await fetchConfluenceDocs(
      site,
      email,
      token,
      atlassianEmail,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: "Architecture Guide",
      reads: 42,
      edits: 5,
    });
    expect(result[0].url).toContain("/wiki/spaces/ENG/pages/page-1");
  });

  it("returns [] when spaceKeys is empty array", async () => {
    const result = await fetchConfluenceDocs(
      site,
      email,
      token,
      "empty-space@example.com",
      [],
    );
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns [] when account ID cannot be resolved", async () => {
    const atlassianEmail = "no-account-conf@example.com";
    // user/picker returns no users
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ users: [] }),
    });
    // user/search fallback also returns no users
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    const result = await fetchConfluenceDocs(
      site,
      email,
      token,
      atlassianEmail,
    );
    expect(result).toEqual([]);
  });

  it("returns [] on failed CQL search", async () => {
    const atlassianEmail = "confluence-fail@example.com";
    mockAccountIdResolution("acc-conf-fail");

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: () => Promise.resolve("Forbidden"),
    });

    const result = await fetchConfluenceDocs(
      site,
      email,
      token,
      atlassianEmail,
    );
    expect(result).toEqual([]);
  });

  it("handles analytics API failure gracefully (reads = 0)", async () => {
    const atlassianEmail = "confluence-no-analytics@example.com";
    mockAccountIdResolution("acc-conf-noana");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [
            {
              id: "page-2",
              title: "Deploy Guide",
              version: { number: 3 },
              _links: { webui: "/wiki/spaces/OPS/pages/page-2" },
            },
          ],
          size: 1,
        }),
    });

    // Analytics call fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve("Not Found"),
    });

    const result = await fetchConfluenceDocs(
      site,
      email,
      token,
      atlassianEmail,
    );
    expect(result).toHaveLength(1);
    expect(result[0].reads).toBe(0);
    expect(result[0].edits).toBe(3);
  });
});
