---
sidebar_position: 7
title: Command Palette
---

# Command Palette

The Command Palette is a universal search and navigation tool built into every screen of DevDash. Press **⌘K** (macOS) or **Ctrl+K** (other platforms) to open it instantly from anywhere in the app.

<!-- screenshot placeholder: command palette open with a search query and mixed results showing PRs, tickets, and nav items -->

## Opening the palette

- **Keyboard shortcut**: ⌘K
- **View menu**: View → Command Palette…
- **Sidebar**: the search icon at the bottom of the sidebar

Press **Escape** to close without navigating.

## What you can search

The palette searches across five result types simultaneously:

| Type | What's included |
|------|----------------|
| **Navigation** | Dashboard, My Day, Team, Reviews, Notifications, Reminders, all Settings pages |
| **Pull requests** | Cached PRs by title, repo name, and PR number |
| **Tickets** | Jira and Linear tickets by title and key |
| **Reminders** | Your reminders by title |
| **Notifications** | Your notifications by title and body |

Results start appearing after you type at least **2 characters**. The palette debounces input so it doesn't fire on every keystroke.

## Navigating results

Use **↑ / ↓ arrow keys** to move between results and **Enter** to activate the selected item. Mouse clicks work too.

- Navigation results jump directly to that page within DevDash
- Pull request results open the PR in your default browser
- Ticket results navigate to the Dashboard with that developer selected
- Reminder and notification results open their respective detail views

## Selecting a developer

The Command Palette requires a selected developer to search PR, ticket, reminder, and notification data. If no developer is selected, only navigation results appear. Select a developer from the top bar first, then open the palette.

:::tip Quick navigation
Even without a search query, the palette is useful for keyboard-driven navigation. Start typing a page name ("team", "settings", "notifications") to jump there without reaching for the mouse.
:::

## Weekly report

The Dashboard **Report** button generates a Markdown summary of the selected developer's engineering activity for the current lookback period, covering PRs, tickets, docs, and review metrics. Click **Copy** to paste it into a message, doc, or standup update.
