# Cross-cutting features (My Day, Team, search, layout, reports)

This document describes **product-facing features** that span multiple screens or IPC channels: how they work technically, which handlers they use, and how they relate to sync and cached data.

For metric definitions see [metrics.md](./metrics.md). For SQLite tables see [database.md](./database.md).

---

## Selected developer (global context)

Several views share **which developer is “active”** for stats, search, and sync targeting.

| Mechanism | Detail |
|-----------|--------|
| React context | `SelectedDeveloperProvider` — `src/context/SelectedDeveloperContext.tsx` |
| Persistence | `localStorage` key `devdash.selectedDevId` |
| Consumers | Dashboard, My Day, Reviews, Team row navigation (sets selection then routes to `/`), command palette (`App.tsx` passes `developerId`) |

The **status bar** (`src/components/layout/StatusBar.tsx`) reads the same context. **Sync** there calls `sync:trigger` with `{ developerId }` when an id is set; **without** an id it calls `sync:trigger` with no payload, which runs a **full** `syncAll()` for every developer (`electron/ipc/sync.ts`).

`AppStatusContext` (`src/context/AppStatusContext.tsx`) uses the same `devdash.selectedDevId` key when mapping `sync:status` → **“Last synced”** text for the selected developer’s aggregate sync times.

**Note:** `reminders:*` and `notifications:list` IPC handlers resolve the developer with **`is_current_user`** in SQLite (`getCurrentUserDeveloper`), not the TopBar selection. My Day’s TopBar can show another developer for reviews/tickets while reminders/notifications still reflect the **marked “you”** profile.

---

## My Day (`/my-day`)

**Purpose:** Single screen for daily standup-style context: GitHub review queue, in-progress tickets, triggered reminders, unread notification count.

**UI:** `src/pages/MyDay.tsx` — uses `TopBar` for developer picker (same pattern as Dashboard).

**Data sources (IPC):**

| Channel | Role |
|---------|------|
| `reviews:get` | `{ developerId }` → `ReviewsResponse` (requested reviews + PRs authored by user needing review signal); cache-first / kicks background sync like dashboard PR path |
| `stats:work` | `{ developerId, days: 30 }` → open tickets; **in progress** filtered in UI via `statusCategory === "in_progress"` |
| `reminders:list` | `{ status: "triggered", limit }` — scoped to the **current user** developer (`is_current_user` in DB via `getCurrentUserDeveloper`), not necessarily the developer selected in the TopBar |
| `notifications:list` | Same **current user** developer as reminders (`getCurrentUserDeveloper`); unread count / list for that profile only |

**Reviews:** Implementation is `electron/ipc/reviews.ts`. GitHub auth is gated with **`hasUsableToken(ghConn)`** (`electron/db/connections.ts`) so a valid decrypted PAT is enough even if the `connected` flag is stale.

---

## Reviews page (`/reviews`)

Dedicated **Pull request reviews** view using the same **`reviews:get`** payload as My Day. Copy directs users to **Sync** in the **status bar** when cache is empty.

---

## Team overview (`/team`)

**Purpose:** Table of **all** developers with snapshot metrics and GitHub review counts from cache.

**UI:** `src/pages/Team.tsx`

**IPC:** `stats:team-overview` — `{ days }` (optional, default 30 in handler).

**Implementation:** `buildTeamOverview` in `electron/ipc/stats.ts` iterates `listDevelopers()`, resolves `getStatsContext` per id, then:

- `buildVelocityStats` / `buildTicketsStats` for velocity, merge ratio, review turnaround, workload health, ticket velocity
- For GitHub: `getCachedMyOpenPRReviewItems`, `getCachedReviewRequestItems` for **open PR count** and **pending review count** (cache-backed)

Row click sets `setSelectedDevId` and navigates to **`/`** (dashboard) with that developer selected.

---

## Command palette & global search

**Shortcuts:** **⌘K** / **Ctrl+K** (toggle). **Escape** closes.

**UI:** `src/components/CommandPalette.tsx` — mounted in `App.tsx` inside main layout with prop `developerId` set to the selected developer id or `null`.

**Behavior:**

- Requires a **selected developer** and query length **≥ 2** before calling the backend.
- Debounced **~200 ms** before `search:global`.

**IPC:** `search:global` — `{ developerId, query, limit? }` (`electron/ipc/search.ts`).

**Result kinds** (union `GlobalSearchResult` in `electron/types.ts`):

| Kind | Source |
|------|--------|
| `nav` | Static nav entries (Dashboard, My Day, Team, …) matched on label/keywords |
| `pr` | `cached_pull_requests` — title, repo, number |
| `ticket` | `cached_jira_tickets` or `cached_linear_issues` |
| `reminder` | `reminders` table |
| `notification` | `notifications` table |

PR results include a GitHub `openUrl`; tickets from search currently navigate to `/` (deep links are a planned improvement; see [roadmap](./roadmap.md)).

---

## Dashboard layout customization

**UI:** Dashboard **Layout** opens `DashboardCustomizeDialog` (`src/components/dashboard/DashboardCustomizeDialog.tsx`).

**Persistence:** `app-config:set` / `app-config:get` with key **`dashboard_widget_layout_json`** — JSON array of widget id strings.

**Allowed ids:** `DASHBOARD_WIDGET_IDS` in `src/lib/dashboard-widgets.ts`:

`metrics_bar`, `triggered_reminders`, `pull_requests`, `open_tickets`, `commit_activity`, `pr_review_comments`, `documentation`

**Parsing:** `parseDashboardLayoutJson` dedupes, drops unknown strings, falls back to default order if empty/invalid.

---

## Weekly Markdown report

**UI:** Dashboard **Report** — fetches markdown, opens modal, copy to clipboard.

**IPC:** `stats:weekly-report-markdown` — `{ developerId, days }` → single string.

**Implementation:** `buildWeeklyReportMarkdown` in `electron/ipc/stats.ts` composes `buildGithubStats`, `buildVelocityStats`, `buildTicketsStats`, `buildConfluenceStats`, `buildPRReviewCommentsStats` into sections (highlights, PRs, work, docs).

---

## Status bar sync

The **Sync** control lives in `StatusBar` next to **Ready / Last synced** messaging. It replaces the former dashboard-only sync button so any route can trigger integration refresh.

See **Selected developer** above for `sync:trigger` payload rules.

---

## Related documentation

- [Architecture](./architecture.md) — IPC overview, sync engine
- [Metrics](./metrics.md) — velocity, review turnaround, PR staleness UI thresholds vs notification config
- [Database](./database.md) — `config` keys, cache tables
- [Notifications](./notifications.md) — `github_stale_pr`, polling
- [Roadmap](./roadmap.md) — shipped vs planned items
