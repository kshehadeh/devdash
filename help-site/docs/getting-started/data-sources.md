---
sidebar_position: 3
title: Data Sources
---

# Data Sources

After connecting your integrations, you need to tell DevDash which repositories, projects, and teams to track. This scoping ensures metrics are accurate and syncs stay fast.

Go to **Settings → Data Sources** to manage sources.

<!-- screenshot placeholder: Settings → Data Sources page with GitHub repos and Jira projects listed -->

## Adding a GitHub repository

1. Under **GitHub Repositories**, click **Add repository**.
2. Search for or type the repository name (`org/repo`).
3. Click **Add** to confirm.

DevDash will sync pull requests and contributions for all added repositories.

## Adding a Jira project

1. Under **Jira Projects**, click **Add project**.
2. DevDash will discover your accessible Jira projects automatically — select one from the list.
3. Click **Add**.

Ticket lists, velocity counts, and workload health are computed from tickets within the projects you add.

## Adding a Linear team

1. Under **Linear Teams**, click **Add team**.
2. Select from your discovered Linear teams.
3. Click **Add**.

## Adding a Confluence space

1. Under **Confluence Spaces**, click **Add space**.
2. Select from your accessible spaces.
3. Click **Add**.

## Assigning sources to developers

Each developer profile in DevDash has its own source assignment. By default, sources are assigned to the current user automatically during onboarding. For team members you add manually:

1. Go to **Settings → Developers** (or click a developer row from the Team page).
2. Click **Edit** and navigate to the **Data sources** tab.
3. Assign the relevant GitHub repos, Jira projects, and Linear teams for that person.

This per-developer assignment is what allows the Team Overview to show accurate, scoped metrics for each engineer.

## Re-syncing data

DevDash syncs automatically in the background on a schedule. To force a refresh at any time, click the **Sync** button in the status bar at the bottom of any screen.

You can also trigger a sync for a specific developer by selecting them in the top bar and clicking Sync — useful when you've just added a new data source and want immediate results.
