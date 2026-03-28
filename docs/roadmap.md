# DevDash product roadmap

Living document: **update this file** when a roadmap item ships or scope changes. High-level intent lives here; implementation details are in code and feature-specific docs (e.g. [notifications.md](./notifications.md), [metrics.md](./metrics.md)).

## Status legend


| Status      | Meaning                              |
| ----------- | ------------------------------------ |
| **Done**    | Shipped in `main`                    |
| **Planned** | Agreed scope, not started or partial |
| **Icebox**  | Idea only — not committed            |


---

## Recently completed (this cycle)


| Item                            | Notes                                                                                                                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Remove unused dashboard widgets | Deleted dormant components (`CommitHeatmap`, `EffortDistribution`, `SprintTracker`, `PerformanceProjection`) and related backend (`fetchActiveSprint`, `classifyEffortDistribution`, sprint/effort types).                                       |
| PR lifecycle & review signal    | `merged_at` / `first_review_submitted_at` on cached PRs (v20); dashboard PR list staleness (warn/danger); **Review turnaround** metric; optional notification type `github_stale_pr`; config keys `pr_stale_warn_days` / `pr_stale_danger_days`. |
| My Day                          | Sidebar **My Day** — reviews queue, in-progress tickets, triggered reminders, unread notifications.                                                                                                                                              |
| Weekly report                   | Dashboard **Report** → Markdown summary (`stats:weekly-report-markdown`), copy to clipboard.                                                                                                                                                     |
| Team overview                   | Sidebar **Team** — table of all developers (`stats:team-overview`), row opens dashboard with that developer selected.                                                                                                                            |
| Configurable dashboard layout   | **Layout** on dashboard; visibility + order persisted in `dashboard_widget_layout_json`.                                                                                                                                                         |
| Command palette                 | **⌘K** / **Ctrl+K** — `search:global` over PRs, tickets, reminders, notifications, nav (requires a selected developer for data search).                                                                                                          |
| Roadmap doc                     | This file + README link.                                                                                                                                                                                                                         |


---

## Planned / next


| ID  | Feature                          | Status  | Notes                                                                                                         |
| --- | -------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| R1  | Morning briefing notification    | Planned | Optional scheduled native notification with digest (builds on My Day data).                                   |
| R2  | Deeper PR / CI integration       | Icebox  | New provider work; deferred.                                                                                  |
| R3  | Settings UI for stale thresholds | Planned | `pr_stale_warn_days` / `pr_stale_danger_days` exist in config; expose in Settings → Notifications or General. |
| R4  | Search: open ticket URLs         | Planned | Jira/Linear deep links from cache when URL is stored or constructible.                                        |
| R5  | Team export                      | Icebox  | CSV / Markdown rollup of team table.                                                                          |


---

## How to update this doc

1. When you **merge** a roadmap feature: move a row from **Planned** to **Recently completed** (or add a row there) and adjust **Planned** / **Icebox** as needed.
2. When **scope changes**, edit the **Notes** column instead of deleting history—add a short “Superseded by …” line if replaced.
3. Keep IDs (**R1**, …) stable so commits and PRs can reference them in the body text.

---

## Related documentation

- [Architecture](./architecture.md)
- [Features](./features.md) — My Day, Team, command palette, dashboard layout, weekly report, status bar sync
- [Metrics](./metrics.md)
- [Notifications](./notifications.md)
- [Database](./database.md)
- [Reminders](./reminders.md)

