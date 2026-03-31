import {
  linearGraphql,
  fetchAllLinearTeams,
  fetchLinearIssuesForAssignee,
} from "../../services/linear";

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch;
});

// ---------------------------------------------------------------------------
// linearGraphql
// ---------------------------------------------------------------------------

describe("linearGraphql", () => {
  it("returns data on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ data: { viewer: { id: "user-1" } } }),
    });

    const result = await linearGraphql<{ viewer: { id: string } }>(
      "lin_api_key",
      "query { viewer { id } }",
    );
    expect(result).toEqual({ viewer: { id: "user-1" } });
  });

  it("throws on non-ok HTTP response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
    });

    await expect(
      linearGraphql("bad-key", "query { viewer { id } }"),
    ).rejects.toThrow("Linear HTTP 403");
  });

  it("throws on GraphQL errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          errors: [
            { message: "Field not found" },
            { message: "Access denied" },
          ],
        }),
    });

    await expect(
      linearGraphql("key", "query { bad }"),
    ).rejects.toThrow("Field not found; Access denied");
  });

  it("throws on empty response (no data)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await expect(
      linearGraphql("key", "query { viewer { id } }"),
    ).rejects.toThrow("Linear: empty response");
  });

  it("sends correct headers and body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: {} }),
    });

    await linearGraphql("my-api-key", "query Q { x }", { foo: "bar" });

    expect(mockFetch).toHaveBeenCalledWith("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "my-api-key",
      },
      body: JSON.stringify({
        query: "query Q { x }",
        variables: { foo: "bar" },
      }),
    });
  });
});

// ---------------------------------------------------------------------------
// fetchAllLinearTeams
// ---------------------------------------------------------------------------

describe("fetchAllLinearTeams", () => {
  it("collects teams from a single page", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            teams: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [
                { id: "t1", key: "ENG", name: "Engineering" },
                { id: "t2", key: "DES", name: "Design" },
              ],
            },
          },
        }),
    });

    const teams = await fetchAllLinearTeams("api-key");
    expect(teams).toEqual([
      { id: "t1", key: "ENG", name: "Engineering" },
      { id: "t2", key: "DES", name: "Design" },
    ]);
  });

  it("paginates across multiple pages", async () => {
    // Page 1
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            teams: {
              pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
              nodes: [{ id: "t1", key: "ENG", name: "Engineering" }],
            },
          },
        }),
    });
    // Page 2
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            teams: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [{ id: "t2", key: "DES", name: "Design" }],
            },
          },
        }),
    });

    const teams = await fetchAllLinearTeams("api-key");
    expect(teams).toHaveLength(2);
    expect(teams[0].key).toBe("ENG");
    expect(teams[1].key).toBe("DES");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// fetchLinearIssuesForAssignee
// ---------------------------------------------------------------------------

describe("fetchLinearIssuesForAssignee", () => {
  it("returns [] for empty teamIds", async () => {
    const result = await fetchLinearIssuesForAssignee("key", [], "user@example.com");
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns [] for empty email", async () => {
    const result = await fetchLinearIssuesForAssignee("key", ["t1"], "");
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns [] for whitespace-only email", async () => {
    const result = await fetchLinearIssuesForAssignee("key", ["t1"], "   ");
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("collects issues from a single page", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            issues: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [
                {
                  id: "issue-1",
                  identifier: "ENG-42",
                  title: "Fix critical bug",
                  updatedAt: "2024-06-01T10:00:00Z",
                  state: { name: "In Progress", type: "started" },
                  team: { id: "t1", key: "ENG" },
                },
              ],
            },
          },
        }),
    });

    const issues = await fetchLinearIssuesForAssignee(
      "key",
      ["t1"],
      "dev@example.com",
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      id: "issue-1",
      identifier: "ENG-42",
      title: "Fix critical bug",
      state: { name: "In Progress", type: "started" },
    });
  });

  it("paginates across multiple pages", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            issues: {
              pageInfo: { hasNextPage: true, endCursor: "c1" },
              nodes: [
                {
                  id: "i1",
                  identifier: "ENG-1",
                  title: "Issue 1",
                  updatedAt: "2024-01-01T00:00:00Z",
                  state: { name: "Todo", type: "unstarted" },
                  team: { id: "t1", key: "ENG" },
                },
              ],
            },
          },
        }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            issues: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [
                {
                  id: "i2",
                  identifier: "ENG-2",
                  title: "Issue 2",
                  updatedAt: "2024-01-02T00:00:00Z",
                  state: { name: "Done", type: "completed" },
                  team: { id: "t1", key: "ENG" },
                },
              ],
            },
          },
        }),
    });

    const issues = await fetchLinearIssuesForAssignee(
      "key",
      ["t1"],
      "dev@example.com",
    );
    expect(issues).toHaveLength(2);
    expect(issues[0].identifier).toBe("ENG-1");
    expect(issues[1].identifier).toBe("ENG-2");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("sends correct query variables", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            issues: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [],
            },
          },
        }),
    });

    await fetchLinearIssuesForAssignee(
      "key",
      ["team-a", "team-b"],
      "  dev@example.com  ",
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.variables.teamIds).toEqual(["team-a", "team-b"]);
    expect(body.variables.email).toBe("dev@example.com");
    expect(body.variables.after).toBeNull();
  });
});
