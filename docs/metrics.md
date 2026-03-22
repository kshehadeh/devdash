# Dashboard metrics reference

This document describes how each **Ecosystem Impact** dashboard value is computed in DevDash: data sources, API fields, SQL/cache fields where applicable, and differences between integrations (GitHub vs. others, Jira vs. Linear).

The dashboard **lookback** (`days`) is the user-selected range (7–90 days). It is passed to IPC as `{ developerId, days }` on `stats:code`, `stats:velocity`, `stats:work`, and `stats:docs`.

Unless noted, metrics use **per-developer** identity and **assigned data sources** (GitHub repos, Jira projects, Linear teams, Confluence spaces) from `getStatsContext` (`electron/ipc/stats-context.ts`).

---

## Metrics bar (top row)

Implemented in `src/components/dashboard/MetricsBar.tsx`; data from `buildVelocityStats`, `buildTicketsStats`, and `buildConfluenceStats` in `electron/ipc/stats.ts`.

### Velocity (GitHub only)

**What the UI shows:** Count plus `% change` vs. the immediately preceding period of the **same length** as `days`.

**Definition:** Number of **pull requests authored by the developer** whose **`created` time falls in the lookback window**, scoped to assigned repos.

| Path | Mechanism |
|------|-----------|
| **Fresh cache** (`github_pull_requests` sync OK) | `computeCachedVelocity` in `electron/db/cache.ts`: counts rows in `cached_pull_requests` with `created_at >= periodStart` and `created_at < now` (and optional `repo IN (...)`). Previous period: `created_at` between `prevPeriodStart` and `periodStart`. |
| **No / stale cache** | `fetchVelocity` in `electron/services/github.ts`: GitHub REST **`GET /search/issues`** with `q` containing `type:pr author:<githubUsername>` and **`created:<start>..<end>`** (inclusive date range, `YYYY-MM-DD` from `toISOString().split("T")[0]`), plus `repo:org/name` per assigned repo. Uses response field **`total_count`** only (`per_page=1`). |

**GitHub search / issue items (when items are fetched elsewhere):** PRs are issues with `repository_url`, `created_at`, `user.login` (author qualifier uses the login). Velocity itself does not read `merged_at` or `state` for the count.

**Important:** This is **not** “merged PRs” or “merged in the period.” It is **opened (created) PRs** in the window. (The in-app tooltip on Velocity currently describes merges; the implementation matches this document.)

**`velocityChange`:** `round((recent - prev) / prev * 100)` when `prev > 0`, else `0`.

**If code integration is not GitHub:** Velocity is `0` and change is `0`.

**If the developer has no GitHub repos assigned:** Velocity is `0` (queries are not run or cache branch returns zeros).

---

### Merge ratio (GitHub only)

**Definition:** Among PRs **authored** by the developer with **`created` in the lookback window**, what percentage **merged** (have a merge time / merged state in our model).

| Path | Mechanism |
|------|-----------|
| **Fresh cache** | `computeCachedMergeRatio`: `merged / total * 100` (rounded), where `total` = rows with `created_at >= since`, `merged` = same + `status = 'merged'` in `cached_pull_requests`. `since` = `new Date(); since.setDate(since.getDate() - days)` as **full ISO string**. |
| **No / stale cache** | `fetchMergeRatio`: two searches — numerator `type:pr author:<user> is:merged created:>=<YYYY-MM-DD>`, denominator `type:pr author:<user> created:>=<YYYY-MM-DD>`, plus repo qualifiers. Ratio = `round(merged.total_count / total.total_count * 100)`. |

**Merged detection (cache population):** `electron/sync/github-sync.ts` / `fetchPullRequests` use `mergedAtFromSearchIssueItem` (`electron/services/github.ts`): `merged_at` **or** `pull_request.merged_at` from **`/search/issues`** items (GitHub nests merge time under `pull_request` on issue results). If merged → stored `status = 'merged'`; closed without merge → `'closed'`; else `'open'`.

**Edge cases:**

- **Denominator zero:** Merge ratio is defined as **`100%`** (both cached and live).
- **No repos assigned (cached):** `computeCachedMergeRatio` returns **`0`** early; live path does not call the API and merge ratio stays **`0`**.

**Semantic note:** Uses **PR creation date**, not merge date. A PR created before the window but merged inside it **does not** affect this ratio; a PR created inside the window counts even if it is still open.

---

### Workload health (Jira and Linear)

**Definition:** A score **`1`–`10`** from `computeWorkloadHealth` in `electron/ipc/stats.ts` (same function for both providers).

Inputs: the **`jiraTickets` array** returned for the work stats payload (Linear issues are **mapped into `JiraTicket` shape** for the UI).

1. `inProgressCount` = tickets with `statusCategory === "in_progress"`.
2. `todoCount` = tickets with `statusCategory === "todo"`.
3. `openCount` = `inProgressCount + todoCount`.
4. If `openCount === 0` → return **`10`**.
5. Else:  
   `wipPenalty = min(5, max(0, (inProgressCount - 2) * 1.5))`  
   `volumePenalty = min(5, max(0, (openCount - 8) * 0.5))`  
   Score = `max(0, round((10 - wipPenalty - volumePenalty) * 10) / 10)`.

**Jira — how `statusCategory` is set**

- **Live** `fetchJiraTickets` (`electron/services/atlassian.ts`): Jira REST **`POST /rest/api/3/search/jql`**. Each issue uses `fields.status.statusCategory.key`:
  - `done` → `"done"`
  - `indeterminate` → `"in_progress"`
  - anything else → `"todo"`
- **Cache** (`syncJiraTickets` in `electron/sync/atlassian-sync.ts`): same mapping stored as `status_category` in `cached_jira_tickets`. Dashboard list uses rows with `status_category != 'done'` and `updated_at >= since`.

JQL for the **list** (live): `assignee = "<accountId>" AND statusCategory != Done AND updated >= "<since-date>"` (+ project filter). Fields requested include `summary`, `status`, `priority`, `issuetype`, `updated`.

**Linear — how `statusCategory` is set**

- Data from **`fetchLinearIssuesForAssignee`** (`electron/services/linear.ts`): GraphQL `issues` nodes with `state { name type }`.
- Stored in `cached_linear_issues.state_type` (Linear **`WorkflowState.type`** string).
- **Mapped** in `getCachedLinearTicketsAsJiraShape` (`electron/db/cache.ts`):
  - `state.type` **`completed`** or **`canceled`** (case-insensitive) → `"done"`
  - **`started`** → `"in_progress"`
  - else → `"todo"`

**Difference vs. Jira:** Linear’s **in progress** is driven by workflow **`type === "started"`**, not Jira’s **`indeterminate`** category. To-do vs. in-progress boundaries will not match Jira semantics even when both show “healthy” scores.

**Tickets feeding workload:** Only **non-done** issues **updated** within the lookback (and matching project/team filters). Done work does not add to `openCount`.

---

### Ticket velocity (Jira vs. Linear)

**Definition:** Integer count shown as “completed” in the metrics bar (with lookback label).

#### Jira

| Path | Rule |
|------|------|
| **Cache** | `getCachedCompletedTicketCount`: count `cached_jira_tickets` where `status_category = 'done'` and `updated_at >= since` (+ project filter). |
| **Live** | `fetchCompletedTicketCount`: JQL `assignee = "<accountId>" AND statusCategory = Done AND updated >= "<since-date>"` (+ project). Uses `POST /rest/api/3/search/jql` with `maxResults: 100`, `fields: ["summary"]`. Count = `data.total` if numeric, else `issues.length`. |

**Meaning:** Issues in Jira’s **Done** status category whose **`updated`** timestamp falls in the lookback — **not** strictly “transitioned to Done in this window” (any update to a Done issue counts).

#### Linear

| Path | Rule |
|------|------|
| **Cache** | `getCachedLinearCompletedCount`: count `cached_linear_issues` where **`LOWER(state_type) IN ('completed','canceled')`** and `updated_at >= since` (+ team filter). |

**Meaning:** Issues whose Linear workflow state **`type`** is **`completed` or `canceled`**, and whose **`updatedAt`** (stored as `updated_at`) is in the lookback.

**Jira vs. Linear — consistency**

| Aspect | Jira | Linear |
|--------|------|--------|
| “Completed” set | `statusCategory = Done` only | **`completed` or `canceled`** state types |
| Time field | `fields.updated` / `updated_at` | `updatedAt` / `updated_at` |
| Canceled / won’t-fix | Excluded unless Jira maps them to Done | **Canceled issues count** toward ticket velocity |

The UI tooltip for Linear explicitly mentions **completed or canceled**; Jira’s tooltip refers to **done/completed** state only.

---

### Doc authority (Confluence only)

**Definition:** `docAuthorityLevel = min(5, max(1, confluenceDocs.length))` in `buildConfluenceStats` (`electron/ipc/stats.ts`).

So it is **clamped 1–5** from the **number of entries** in `confluenceDocs`, not a separate analytics score.

**Where `confluenceDocs` comes from**

- **Fresh cache:** `getCachedConfluencePages` — up to **10** rows from `cached_confluence_pages` for the developer (optional space filter), ordered by `last_modified DESC`.
- **Live:** `fetchConfluenceDocs` (`electron/services/atlassian.ts`): Confluence **`GET /wiki/rest/api/content/search`** with CQL  
  `contributor = "<accountId>" AND type = page` (+ `space IN (...)`). **`limit=10`**, `expand=version,space`.  
  Per page: **`title`**, **`version.number`** → `edits`, optional **`/rest/api/analytics/content/{id}/views`** → `reads` (`count`).

**Important:** The metric is effectively **how many contributor pages appear in that top-10 result set** (1–5 cap), not views/comments/total activity. The dashboard tooltip describes a richer “authority” concept; the code matches this document.

If docs integration is not Confluence or lists are empty, level is still at least **`1`** when the payload is built with empty docs (`max(1, 0)` → 1).

---

## GitHub panel (contributions, PR list, effort split)

Served by `stats:code` / `buildGithubStats`.

### Contribution heatmap and YTD total

- **API:** GitHub GraphQL `viewer` / `user(login:)` → `contributionsCollection.contributionCalendar` (`electron/services/github.ts` → `fetchContributionCalendar`).
- **Fields:** `totalContributions`; per day `contributionCount`, `date` on each `contributionDay`.
- **Range:** Approximately **last calendar year** from GraphQL variables `from` / `to` — **not** tied to dashboard lookback (UI label: “Heatmap: 1 year”).
- **Cache:** `cached_contributions` rows `(developer_id, date, count)`; `commitsYTD` = sum of `count` for `date >= January 1` of current year (`getCachedCommitsYTD`).

### Pull request list (last N in lookback)

- **Cache:** `getCachedPullRequests`: `cached_pull_requests` where `developer_id` + `created_at >= since` (+ repo filter), order `updated_at DESC`, **limit 15**. Maps `title`, `repo`, `pr_number`, `status`, `review_count`, `updated_at`.
- **Live:** `fetchPullRequests`: three **`/search/issues`** queries (open / merged / closed unmerged) with `created:>=<date>` and `repo:` filters, **per_page=10** each, merged/deduped, then **slice(15)**. Open PRs may refresh `reviewCount` via **`GET /repos/{owner}/{repo}/pulls/{n}/reviews`**.

**Search item fields used:** `title`, `number`, `html_url`, `updated_at`, `created_at`, `state`, `repository_url`, `review_comments`, `requested_reviewers`, `merged_at` / `pull_request.merged_at` for status.

### Effort distribution (feature / bug / review)

- **Function:** `classifyEffortDistribution` (`electron/services/github.ts`) on the **same PR list** as above (up to **15** titles).
- **Rules (case-insensitive title):**
  - **Bug fix:** title matches `\b(fix|bug|patch|hotfix|issue|error|crash|broken)\b`.
  - Else if title matches `\b(review|refactor|cleanup|lint|style|format|rename|chore|ci|test)\b` → counted as **code review** bucket (remainder).
  - Else → **feature**.
- **Percentages:** Rounded percents; **code review** = `100 - feature% - bugFix%` (minimum 0).
- **No PRs:** Returns placeholder split **34 / 33 / 33**.

---

## Work panel (ticket list)

Same `stats:work` payload as metrics: **`jiraTickets`** (name kept for both providers).

- **Jira:** Up to **50** issues (cache) or **20** (live `maxResults`), non-done, `updated` in lookback, assignee = resolved **accountId** for work email, project filter.
- **Linear:** Up to **50** from cache, `state_type` not `completed`/`canceled`, `updated_at` in lookback, team filter; assignee filtering happens at sync (`assignee: { email: { eq } }` in GraphQL).

---

## Confluence panel (documentation)

Same `stats:docs` as metrics: **`confluenceDocs`** (up to 10) and **`confluenceActivity`** (up to 5 “recent edit” style rows).

**Cache:** `getCachedConfluenceActivity` reads `last_modified` from `cached_confluence_pages`.

**Live activity:** `fetchConfluenceActivity` uses search results with `version.when` or `history.lastUpdated.when` for timestamps.

---

## Cached vs. live behavior (all integrations)

- If **`sync_log`** for the relevant `data_type` has **`status = 'ok'`** (`hasFreshCache`), stats prefer **SQLite** (`electron/db/cache.ts`).
- Otherwise the app may **trigger background `syncDeveloper`** and, when credentials and filters allow, call **live APIs** as described above.

Incremental syncs populate caches from the same vendor APIs; field mappings above apply to **what gets stored** (e.g. Jira `fields.status.statusCategory.key` → `status_category`).

---

## Quick reference: primary API surfaces

| Metric / area | Primary API |
|---------------|-------------|
| Velocity, merge ratio (live) | GitHub `GET https://api.github.com/search/issues` |
| Contributions | GitHub GraphQL `contributionsCollection` |
| PR details / reviews | GitHub REST search + `pulls/{n}/reviews` |
| Jira tickets & velocity | Jira Cloud `POST /rest/api/3/search/jql` |
| Linear issues | Linear GraphQL `https://api.linear.app/graphql` (`issues` query) |
| Confluence docs / activity | Confluence REST `content/search` (+ optional analytics views) |

For new integrations or parity work, align **time field** (created vs. updated), **“done” semantics** (Jira category vs. Linear state type including canceled), and **author/assignee identity** (GitHub login, Jira accountId, Linear assignee email) with the tables above.
