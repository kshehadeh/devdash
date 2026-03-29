---
sidebar_position: 2
title: My Day
---

# My Day

My Day is your daily standup screen. It answers the question *"what needs my attention right now?"* without requiring you to open GitHub, Jira, or your notification inbox separately.

<!-- screenshot placeholder: My Day page showing review requests, in-progress tickets, and triggered reminders -->

## What My Day shows

### Review requests

Every open pull request where you have been explicitly requested as a reviewer. For each PR you can see:

- Title and repository
- The author who requested your review
- How long the PR has been open

Click any row to open the pull request in your browser.

### Your open PRs with pending reviews

Pull requests you authored that have reviewer activity — approvals, change requests, or unresolved comments. This helps you prioritise responding to feedback before the conversation goes cold.

### In-progress tickets

Your Jira or Linear tickets in an **in-progress** state (Jira: `In Progress`/`indeterminate` category; Linear: `started` workflow state type). These are the things you're supposed to be actively working on right now.

### Triggered reminders

Any reminders that have reached their scheduled time and haven't been snoozed or dismissed yet. Click a reminder to go directly to the Reminders page. You can dismiss or snooze from there.

### Notification count

An unread count linking to the full notification center. My Day surfaces this number so you can see at a glance whether anything has come in overnight.

## Selecting a developer

My Day uses the same **developer selector** in the top bar as the Dashboard — switch between profiles to see My Day for any team member.

:::note Reminders and notifications are always "yours"
Review data and tickets follow the selected developer. However, reminders and notifications always reflect the developer marked as **"current user"** in Settings → Developers — not the top-bar selection. This means My Day can show another engineer's PR queue while still surfacing your personal reminders.
:::

## Using My Day for standups

My Day is designed to be the first thing you open in the morning. A typical flow:

1. Glance at **Review requests** — respond to any PR that's been waiting.
2. Check **Your open PRs** — follow up on reviewer feedback.
3. Scan **In-progress tickets** — confirm your planned work for the day matches what's tracked.
4. Clear any **Triggered reminders** — dismiss or snooze.
5. Open the notification center if the unread count is non-zero.
