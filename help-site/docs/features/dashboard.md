---
sidebar_position: 1
title: Dashboard
---

# Dashboard

The Dashboard is your engineering home screen. It aggregates pull request data, ticket workload, commit activity, documentation contributions, and peer review signals into a single, configurable view — all scoped to the selected developer and lookback period.

<!-- screenshot placeholder: full dashboard view showing metrics bar, PR list, and ticket list -->

## Lookback period

Use the **lookback selector** in the top bar to choose how far back metrics reach: 7, 14, 30, 60, or 90 days. Every metric on the dashboard respects this window, so you can zoom in on a sprint or zoom out for a quarterly view.

## Metrics bar

The metrics bar runs across the top of the dashboard and summarizes the most important engineering signals at a glance.

<!-- screenshot placeholder: metrics bar showing velocity, merge ratio, review turnaround, workload health, ticket velocity -->

### Velocity
The number of pull requests **opened** by this developer in the lookback period, plus a percentage change compared to the previous period of the same length. A rising velocity with a healthy merge ratio indicates sustainable output.

### Merge ratio
The percentage of pull requests (opened in the lookback window) that have been merged. Low merge ratios can signal stalled PRs, frequent reverts, or work that gets abandoned before merging.

### Review turnaround
The average time from PR creation to the first submitted review, in hours. Tracked only for PRs where review data is available from sync. A low turnaround means your team reviews quickly; a high number is worth investigating.

### Workload health
A score from **1–10** reflecting current ticket load (Jira or Linear). The score decreases as the number of in-progress tickets grows beyond two and as the total open ticket count exceeds eight. A score of 10 means no open tickets; scores below 5 suggest significant WIP accumulation.

| Score | What it means |
|-------|---------------|
| 9–10 | Healthy — no significant backlog |
| 6–8 | Manageable workload |
| 3–5 | High WIP — consider limiting in-progress items |
| 1–2 | Very high load — risk of context switching and delays |

### Ticket velocity
The count of Jira or Linear tickets moved to a **done / completed** state within the lookback period. For Jira this is the Done status category; for Linear it includes both completed and canceled state types.

### Doc authority
A 1–5 score reflecting how many Confluence pages you have contributed to recently (capped at 5). It's a lightweight indicator of documentation participation rather than a precise metric.

## Pull request list

The PR list shows your most recent authored pull requests within the lookback window.

<!-- screenshot placeholder: PR list with open, merged, and stale states visible -->

**Staleness indicators** automatically flag open PRs with no reviews:

| Badge | Condition |
|-------|-----------|
| ⚠ **Needs review** | Open, zero reviews, 3+ days old |
| 🔴 **Stale** | Open, zero reviews, 7+ days old |

Right-click any PR to open a context menu with options including **Remind me** — which creates a reminder tied to that PR.

## Ticket list

Your open Jira or Linear tickets (non-done, updated within the lookback). Each ticket shows its status, priority (Jira), type, and how recently it was updated.

<!-- screenshot placeholder: ticket list showing Jira tickets with priority dots and status badges -->

Right-click any ticket for the **Remind me** option.

## Commit activity

A contribution heatmap covering the past year (independent of the lookback period), with a total commits-this-year count. Powered by GitHub's contribution calendar API.

<!-- screenshot placeholder: commit activity heatmap -->

## PR review activity

Three counts derived from cached review data:

- **Comments left** — inline review comments you authored on others' PRs
- **Approvals given** — PR reviews you submitted with an APPROVE state
- **Comments received** — review comments left by others on your pull requests

## Documentation

Recent Confluence pages you have contributed to, with edit and view counts.

## Customising the layout

Click **Layout** in the dashboard header to open the layout editor. You can show, hide, and reorder any widget section. The layout is saved per-user.

<!-- screenshot placeholder: dashboard layout editor dialog -->
