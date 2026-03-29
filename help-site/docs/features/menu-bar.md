---
sidebar_position: 8
title: Menu Bar Icon
---

# Menu Bar Icon

DevDash places an icon in the macOS menu bar so you can see your open PRs and tickets without switching windows or leaving your current app. One click — your most pressing work items are visible.

<!-- screenshot placeholder: menu bar icon with popover open showing PRs and tickets -->

## What the popover shows

The popover displays two sections:

### Open Pull Requests
All your authored pull requests currently in an **open** state, sorted **oldest to newest** by creation date. Oldest items appear at the top because they're most likely to be forgotten or stale.

### Open Tickets
Your in-progress and to-do Jira or Linear tickets (non-done), sorted **oldest to newest** by last-updated date.

Each item shows:
- Title (truncated if long)
- Subtitle — repo and PR number for pull requests; ticket key and status for tickets
- Age badge — how long ago the item was created or last updated

## Interacting with items

**Click any item** to open it in your default browser.

**Footer actions:**

| Action | What it does |
|--------|--------------|
| **Open DevDash** | Brings the main DevDash window to the foreground |
| **⚙ (Settings icon)** | Opens DevDash and navigates directly to Settings |
| **↻ (Refresh icon)** | Manually refreshes the popover data |

The popover auto-refreshes every 60 seconds while open.

## Enabling and disabling

The menu bar icon is **on by default**. To toggle it:

1. Open **Settings → General**.
2. Find the **Menu bar icon** section.
3. Check or uncheck **Enable menu bar icon**.

<!-- screenshot placeholder: Settings → General showing menu bar icon toggle -->

Changes take effect immediately — no restart required.

## Keeping DevDash running in the background

When the menu bar icon is enabled, closing the main DevDash window does **not** quit the app. DevDash stays active in the menu bar so the popover remains available.

To fully quit DevDash, use one of these methods:
- **DevDash menu → Quit DevDash** (macOS menu bar)
- Right-click the **Dock icon → Quit**

If the menu bar icon is **disabled**, closing the last window quits the app as expected.

## Data freshness

The popover reads from DevDash's local cache — the same data that powers the main dashboard. If you want the most current state, click the **↻** refresh button or trigger a sync from the main window's status bar.

:::note No current user configured
If you haven't set a developer as "current user" in Settings → Developers, the popover will show an empty state with a message prompting you to do so. The menu bar icon always shows data for the developer marked as **current user**, not the top-bar selection in the main window.
:::
