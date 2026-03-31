import {
  mergedAtFromSearchIssueItem,
  latestReviewStateFromReviews,
  earliestReviewSubmittedAt,
  fetchContributionCalendar,
  fetchReviewRequests,
  fetchMergeRatio,
  fetchVelocity,
} from "../../services/github";

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch;
});

// ---------------------------------------------------------------------------
// mergedAtFromSearchIssueItem
// ---------------------------------------------------------------------------

describe("mergedAtFromSearchIssueItem", () => {
  it("returns root merged_at when present", () => {
    expect(
      mergedAtFromSearchIssueItem({ merged_at: "2024-01-01T00:00:00Z" }),
    ).toBe("2024-01-01T00:00:00Z");
  });

  it("falls back to pull_request.merged_at", () => {
    expect(
      mergedAtFromSearchIssueItem({
        pull_request: { merged_at: "2024-02-02T00:00:00Z" },
      }),
    ).toBe("2024-02-02T00:00:00Z");
  });

  it("returns null when neither is present", () => {
    expect(mergedAtFromSearchIssueItem({})).toBeNull();
  });

  it("prefers root merged_at over pull_request.merged_at", () => {
    expect(
      mergedAtFromSearchIssueItem({
        merged_at: "2024-01-01T00:00:00Z",
        pull_request: { merged_at: "2024-02-02T00:00:00Z" },
      }),
    ).toBe("2024-01-01T00:00:00Z");
  });

  it("returns null when merged_at is null and pull_request is null", () => {
    expect(
      mergedAtFromSearchIssueItem({ merged_at: null, pull_request: null }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// latestReviewStateFromReviews
// ---------------------------------------------------------------------------

describe("latestReviewStateFromReviews", () => {
  it("returns null for empty array", () => {
    expect(latestReviewStateFromReviews([])).toBeNull();
  });

  it("returns APPROVED when last meaningful review is APPROVED", () => {
    expect(
      latestReviewStateFromReviews([
        { state: "COMMENTED" },
        { state: "APPROVED" },
      ]),
    ).toBe("APPROVED");
  });

  it("ignores non-meaningful states like PENDING and DISMISSED", () => {
    expect(
      latestReviewStateFromReviews([
        { state: "APPROVED" },
        { state: "PENDING" },
        { state: "DISMISSED" },
      ]),
    ).toBe("APPROVED");
  });

  it("returns the LAST meaningful review state", () => {
    expect(
      latestReviewStateFromReviews([
        { state: "APPROVED" },
        { state: "CHANGES_REQUESTED" },
      ]),
    ).toBe("CHANGES_REQUESTED");
  });

  it("returns COMMENTED when that is the only meaningful state", () => {
    expect(
      latestReviewStateFromReviews([
        { state: "PENDING" },
        { state: "COMMENTED" },
      ]),
    ).toBe("COMMENTED");
  });

  it("returns null when all reviews are non-meaningful", () => {
    expect(
      latestReviewStateFromReviews([
        { state: "PENDING" },
        { state: "DISMISSED" },
      ]),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// earliestReviewSubmittedAt
// ---------------------------------------------------------------------------

describe("earliestReviewSubmittedAt", () => {
  it("returns null for empty array", () => {
    expect(earliestReviewSubmittedAt([])).toBeNull();
  });

  it("returns the earliest ISO date string", () => {
    const result = earliestReviewSubmittedAt([
      { submitted_at: "2024-03-15T10:00:00Z" },
      { submitted_at: "2024-01-01T00:00:00Z" },
      { submitted_at: "2024-06-01T12:00:00Z" },
    ]);
    expect(result).toBe("2024-01-01T00:00:00.000Z");
  });

  it("skips reviews without submitted_at", () => {
    const result = earliestReviewSubmittedAt([
      {},
      { submitted_at: "2024-05-05T10:00:00Z" },
    ]);
    expect(result).toBe("2024-05-05T10:00:00.000Z");
  });

  it("returns null when no reviews have submitted_at", () => {
    expect(earliestReviewSubmittedAt([{}, {}])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// fetchContributionCalendar
// ---------------------------------------------------------------------------

describe("fetchContributionCalendar", () => {
  it("returns commits and totalContributions on success", async () => {
    mockFetch.mockResolvedValueOnce({
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
                        { date: "2024-01-01", contributionCount: 5 },
                        { date: "2024-01-02", contributionCount: 3 },
                      ],
                    },
                  ],
                },
              },
            },
          },
        }),
    });

    const result = await fetchContributionCalendar("tok", "user1");
    expect(result.totalContributions).toBe(42);
    expect(result.commits).toEqual([
      { date: "2024-01-01", count: 5 },
      { date: "2024-01-02", count: 3 },
    ]);
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    });

    await expect(fetchContributionCalendar("bad", "user1")).rejects.toThrow(
      "GitHub GraphQL error 401: Unauthorized",
    );
  });

  it("sends correct headers", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            user: {
              contributionsCollection: {
                contributionCalendar: {
                  totalContributions: 0,
                  weeks: [],
                },
              },
            },
          },
        }),
    });

    await fetchContributionCalendar("my-token", "user1");

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[0]).toBe("https://api.github.com/graphql");
    const opts = callArgs[1];
    expect(opts.headers.Authorization).toBe("Bearer my-token");
    expect(opts.headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
    expect(opts.method).toBe("POST");
  });
});

// ---------------------------------------------------------------------------
// fetchReviewRequests
// ---------------------------------------------------------------------------

describe("fetchReviewRequests", () => {
  it("returns ReviewRequestItem[] on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          total_count: 1,
          items: [
            {
              number: 42,
              title: "Fix bug",
              state: "open",
              html_url: "https://github.com/org/repo/pull/42",
              repository_url: "https://api.github.com/repos/org/repo",
              updated_at: "2024-06-01T12:00:00Z",
              user: { login: "author1" },
              requested_reviewers: [],
              review_comments: 0,
              created_at: "2024-06-01T10:00:00Z",
            },
          ],
        }),
    });

    const result = await fetchReviewRequests("tok", "reviewer1");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "rr-org-repo-42",
      title: "Fix bug",
      repo: "org/repo",
      number: 42,
      authorLogin: "author1",
    });
  });

  it("returns [] when repos is empty array", async () => {
    const result = await fetchReviewRequests("tok", "user", []);
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns [] on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Server Error"),
    });

    const result = await fetchReviewRequests("tok", "user");
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// fetchMergeRatio
// ---------------------------------------------------------------------------

describe("fetchMergeRatio", () => {
  it("calculates merge percentage correctly", async () => {
    // merged count
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ total_count: 8, items: [] }),
    });
    // total count
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ total_count: 10, items: [] }),
    });

    const result = await fetchMergeRatio("tok", "user");
    expect(result).toBe(80);
  });

  it("returns 100 when total is 0", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ total_count: 0, items: [] }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ total_count: 0, items: [] }),
    });

    const result = await fetchMergeRatio("tok", "user");
    expect(result).toBe(100);
  });

  it("returns 0 when repos is empty", async () => {
    const result = await fetchMergeRatio("tok", "user", []);
    expect(result).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 0 on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Error"),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ total_count: 10, items: [] }),
    });

    const result = await fetchMergeRatio("tok", "user");
    expect(result).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// fetchVelocity
// ---------------------------------------------------------------------------

describe("fetchVelocity", () => {
  it("calculates velocity and velocityChange", async () => {
    // recent period
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ total_count: 12, items: [] }),
    });
    // previous period
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ total_count: 10, items: [] }),
    });

    const result = await fetchVelocity("tok", "user");
    expect(result.velocity).toBe(12);
    expect(result.velocityChange).toBe(20); // (12-10)/10 * 100 = 20
  });

  it("returns 0 velocityChange when previous period is 0", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ total_count: 5, items: [] }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ total_count: 0, items: [] }),
    });

    const result = await fetchVelocity("tok", "user");
    expect(result.velocity).toBe(5);
    expect(result.velocityChange).toBe(0);
  });

  it("returns zeros when repos is empty", async () => {
    const result = await fetchVelocity("tok", "user", []);
    expect(result).toEqual({ velocity: 0, velocityChange: 0 });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("handles non-ok responses gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Error"),
    });
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Error"),
    });

    const result = await fetchVelocity("tok", "user");
    // When responses fail, json defaults to { total_count: 0, items: [] }
    expect(result.velocity).toBe(0);
    expect(result.velocityChange).toBe(0);
  });
});
