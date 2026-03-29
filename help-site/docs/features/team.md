---
sidebar_position: 4
title: Team Overview
---

# Team Overview

The Team page gives engineering leads and managers a single table showing the current engineering pulse across every developer tracked in DevDash. No spreadsheets, no asking around — just a snapshot derived from the same live data each individual developer sees on their own dashboard.

<!-- screenshot placeholder: Team page showing developer table with metrics columns -->

## The team table

Each row represents one developer profile in DevDash, with the following columns:

| Column | What it shows |
|--------|---------------|
| **Developer** | Name and avatar |
| **Velocity** | PRs opened in the selected lookback period |
| **Merge ratio** | Percentage of opened PRs that were merged |
| **Review turnaround** | Average hours from PR creation to first review |
| **Workload health** | 1–10 score based on in-progress and total open ticket count |
| **Ticket velocity** | Tickets completed in the lookback period |
| **Open PRs** | Currently open authored pull requests |
| **Pending reviews** | PRs waiting on this developer's review |

## Lookback period

Use the lookback selector to change the period used for velocity, merge ratio, and ticket velocity. All columns update together.

## Navigating to a developer

Click any row to select that developer and open their full Dashboard. The developer selection persists across views — use the top bar to switch back to your own profile when you're done.

## Who shows up in the table

Every developer profile you have created in DevDash appears in the Team table, regardless of whether they are the "current user". This makes Team useful for:

- **Tech leads** reviewing their team's throughput in weekly syncs
- **Engineering managers** identifying who has a heavy ticket load or a stalled PR backlog
- **Developers** getting a sense of peer workload before assigning a review

## Data freshness

Team data is sourced from the same SQLite cache as individual dashboards. The data is as fresh as the last successful sync for each developer. Developers whose integrations are not connected or whose data sources are not assigned will show zeros for the corresponding metrics.
