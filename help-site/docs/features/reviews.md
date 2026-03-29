---
sidebar_position: 3
title: Reviews
---

# Reviews

The Reviews page is a dedicated view for all pull request review activity. It shows two perspectives at once: reviews others have requested from you, and review activity happening on your own open pull requests.

<!-- screenshot placeholder: Reviews page with "Requested of you" and "On your pull requests" sections -->

## Requested of you

A list of every open pull request where you are a named reviewer. Each row shows:

- PR title and repository
- The author who requested your review
- How long ago the request was made

This list is pulled directly from the GitHub review queue cache, so it's fast and doesn't require a live API call each time you open the page.

## On your pull requests

Open pull requests you authored, with a summary of their current review state:

- **Approved** — at least one reviewer has approved the PR
- **Changes requested** — a reviewer has requested changes
- **Pending** — review requested but no response yet
- List of pending reviewer names

This view makes it easy to see which of your PRs need a follow-up (replying to change requests, re-requesting reviews after addressing feedback) without digging into GitHub.

## Syncing review data

Review data is synced during the regular background sync cycle. If the list looks outdated, click **Sync** in the status bar to refresh immediately. The Reviews page will show the sync timestamp so you can see how fresh the data is.

:::info GitHub only
The Reviews page requires GitHub as your code integration. If GitHub is not connected, or the developer doesn't have a GitHub username set, the page will display a setup prompt.
:::

## Opening a PR

Click any PR row to open it directly in your browser. Right-click for a context menu that includes **Remind me** — useful for scheduling a follow-up review for a PR you're not ready to look at right now.
