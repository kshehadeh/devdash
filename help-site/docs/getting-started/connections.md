---
sidebar_position: 2
title: Connecting Integrations
---

# Connecting Integrations

DevDash connects to your developer tools via **Settings → Connections**. Each integration requires a credential you generate in the respective service — DevDash stores them encrypted on-device and never sends them anywhere other than the originating API.

<!-- screenshot placeholder: Settings → Connections page with GitHub, Jira, and Linear sections visible -->

## GitHub

GitHub is the code integration and is required for pull request data, contribution graphs, and review queues.

1. Open **Settings → Connections** and click **Connect GitHub**.
2. Generate a [Personal Access Token](https://github.com/settings/tokens/new) in GitHub with the following scopes:
   - `repo` — read repository data and pull requests
   - `read:user` — resolve your GitHub username
3. Paste the token into DevDash and click **Save**.

DevDash will immediately run a background sync to populate your PR history and contribution data.

:::tip Fine-grained tokens
GitHub also supports fine-grained PATs scoped to specific repositories. This is useful if you want to limit DevDash access to work repositories only. Under **Repository access**, select **Only select repositories** and add your repos. Required permissions: **Contents** (read), **Pull requests** (read), **Metadata** (read).
:::

## Jira

Jira provides your ticket workload, status categories, and velocity data.

1. Open **Settings → Connections** and click **Connect Jira**.
2. Enter your Atlassian **organization slug** — the subdomain in your Jira URL: `https://YOUR-ORG.atlassian.net`.
3. Enter the **email address** associated with your Atlassian account.
4. Generate an [Atlassian API token](https://id.atlassian.com/manage-profile/security/api-tokens) and paste it in.
5. Click **Save**.

:::note Jira and Confluence share credentials
If you use both Jira and Confluence, you only need to enter your Atlassian credentials once — the same connection powers both integrations.
:::

## Linear

Linear is supported as an alternative work tracking integration.

1. Open **Settings → Connections** and click **Connect Linear**.
2. Generate an [API key](https://linear.app/settings/api) in Linear (Personal API keys section).
3. Optionally enter your Linear workspace slug for deep links to issues.
4. Paste the key into DevDash and click **Save**.

## Confluence

Confluence provides documentation activity and page contribution data.

Confluence uses the same Atlassian credentials as Jira. If you have already connected Jira, Confluence is automatically available — just assign Confluence spaces in **Settings → Data Sources**.

## Choosing your integration providers

DevDash organizes integrations into three categories, each with one active provider at a time:

| Category | Purpose | Options |
|----------|---------|---------|
| **Code** | Pull requests, contributions, review queue | GitHub |
| **Work** | Tickets, sprints, workload | Jira, Linear |
| **Docs** | Documentation activity | Confluence |

Go to **Settings → Connections** to switch the active provider for Work if your team uses Linear instead of Jira.
