# DevDash

A desktop developer dashboard that aggregates your code, work tracking, and documentation activity into a single view. Connect your tools — GitHub, Jira, Linear, Confluence — and get a real-time picture of your engineering impact.


## Features

- **Ecosystem Impact metrics** — velocity, merge ratio, **review turnaround** (time to first review), workload health, ticket throughput, and documentation authority at a glance
- **GitHub** — contribution history, pull request list (staleness hints, merge timing), commit activity, PR review comments and approvals you gave, and comments others left on your PRs
- **Work tracking** — Jira or Linear issues with status categories and workload scoring
- **Documentation** — Confluence page edits, reads, and knowledge influence
- **My Day** — single view for reviews waiting on you, in-progress tickets, triggered reminders, and notification status
- **Team overview** — compare tracked developers in one table; jump to an individual dashboard
- **Weekly Markdown report** — one-click summary of the selected lookback for status updates or reviews
- **Command palette (⌘K / Ctrl+K)** — search PRs, tickets, reminders, notifications, and pages
- **Multi-developer support** — track metrics for yourself or your team
- **Offline-first** — SQLite cache with background sync so the dashboard loads instantly
- **Auto-updates** — built-in update mechanism via GitHub Releases

### Dashboard widgets

The dashboard presents your engineering activity through modular widgets that refresh based on your selected time window (7, 14, 30, 60, or 90 days). Use **Layout** on the dashboard to show, hide, and reorder sections.

- **Pull Requests** — Open and merged PRs with staleness indicators, review counts, merge timing, and quick access to GitHub
- **Commit Activity** — Daily commit bar chart showing coding velocity over the selected period
- **PR Review Comments** — Bar chart tracking your review participation and collaboration activity
- **Open Tickets** — Current Jira or Linear issues with status, priority, and workload scoring
- **Documentation** — Recent Confluence page updates, reads, and knowledge contribution metrics

Context menus on pull requests, tickets, and documentation items let you quickly set reminders or open external links.

### Reminders

Built-in reminder system to help you stay on top of tasks:

- **Flexible scheduling** — Set reminders for any date/time with optional notes and external links
- **Desktop notifications** — Native notifications when reminders trigger with click-to-navigate
- **Status tracking** — Pending, triggered, snoozed, and dismissed states with automatic sorting
- **macOS Reminders integration** — Bidirectional sync with the macOS Reminders app (optional, macOS only)
- **Context integration** — Create reminders directly from pull requests, tickets, or docs via context menus

Reminders can be managed from the dedicated Reminders page accessible via the sidebar.

See [docs/reminders.md](docs/reminders.md) for technical details.

## Download

DevDash is distributed as a macOS `.dmg`. Grab the latest release from [GitHub Releases](https://github.com/kshehadeh/devdash/releases).

| Architecture | File |
|---|---|
| Apple Silicon (M1+) | `DevDash-<version>-arm64.dmg` |
| Intel | `DevDash-<version>-x64.dmg` |

After downloading, open the `.dmg` and drag **DevDash** into your Applications folder. On first launch, macOS may ask you to allow the app in **System Settings > Privacy & Security**.

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Bun](https://bun.sh/) (used as the package manager and script runner)

### Setup

```bash
git clone https://github.com/kshehadeh/devdash.git
cd devdash
bun install
```

If `better-sqlite3` fails to build against Electron's Node headers, run:

```bash
bun run electron:rebuild
```

### Running locally

```bash
bun run dev
```

This starts Vite (renderer) and the Electron main process concurrently. The app will open automatically once the dev server is ready.

### Building a distributable

```bash
# Local build (skips code-signing and notarization)
bun run electron:build:local

# Signed + notarized build for distribution
bun run electron:build
```

Output goes to `dist-electron/`.

## Architecture

DevDash is an Electron app with a **Vite + React** renderer and a **Node.js main process** that owns SQLite, encrypted credentials, background sync, and vendor API clients. Communication between the two happens over IPC.

The product is organized around three integration categories — **Code**, **Work**, and **Docs** — each backed by a pluggable provider:

| Category | Providers |
|---|---|
| Code | GitHub |
| Work | Jira, Linear |
| Docs | Confluence |

See [docs/architecture.md](docs/architecture.md) for the full system design, [docs/features.md](docs/features.md) for My Day, Team, command palette, layout, and reports, [docs/metrics.md](docs/metrics.md) for metric definitions, [docs/notifications.md](docs/notifications.md) for the integration notification system, and [docs/roadmap.md](docs/roadmap.md) for the product roadmap and feature status.

## Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repository and create a feature branch from `main`.
2. **Install dependencies** and make sure `bun run dev` works before you start.
3. **Make your changes** — keep commits focused and follow [Conventional Commits](https://www.conventionalcommits.org/) (e.g. `feat:`, `fix:`, `docs:`).
4. **Test locally** — run the app and verify your changes work end-to-end.
5. **Open a pull request** against `main` with a clear description of what changed and why.

### Adding a new integration provider

If you want to add support for a new tool (e.g. Bitbucket, Notion, GitLab), see the [architecture doc](docs/architecture.md#extending-with-a-new-provider-checklist) for the full checklist covering sync tasks, cache tables, IPC handlers, and UI wiring.

## License

This project is private and not currently published under an open-source license.
