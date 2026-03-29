---
sidebar_position: 6
title: Reminders
---

# Reminders

The Reminders system lets you schedule a future nudge for any PR, ticket, doc, or free-form note — directly from within DevDash. Reminders optionally sync two-way with the **macOS Reminders** app so they surface in your system notification center even when DevDash isn't in the foreground.

<!-- screenshot placeholder: Reminders page with a mix of pending, triggered, and snoozed reminders -->

## Creating a reminder

### From a context menu (recommended)
Right-click any pull request, ticket, or Confluence document anywhere in DevDash and choose **Remind me**. A time picker appears with quick presets (in 1 hour, in 4 hours, tomorrow morning, etc.). Select a time and the reminder is created with the item's title and URL pre-filled.

<!-- screenshot placeholder: context menu showing "Remind me" option with time picker -->

### From the Reminders page
Open the **Reminders** page from the sidebar and click **New reminder**. Fill in:
- **Title** — what you want to be reminded about
- **Comment** — optional notes
- **Link** — optional URL (PR, ticket, external resource)
- **Remind at** — date and time

## Reminder lifecycle

```
Pending → Triggered → Dismissed
                ↓         ↑
             Snoozed ─────┘
```

| Status | Description |
|--------|-------------|
| **Pending** | Scheduled for the future, not yet due |
| **Triggered** | Time reached — appears in My Day and shows a desktop alert |
| **Snoozed** | Temporarily deferred; will trigger again at the snooze time |
| **Dismissed** | Acknowledged and done |

## When a reminder triggers

When a reminder's scheduled time arrives (checked every minute):

1. Its status changes to **Triggered**
2. A native macOS desktop notification fires
3. A banner appears at the top of the Dashboard
4. The reminder appears highlighted in the Reminders page under the **Triggered** filter

Clicking the desktop notification brings DevDash to the foreground and scrolls to the triggered reminder.

## Snooze options

From a triggered reminder, click **Snooze** to pick a new time:

- 15 minutes
- 1 hour
- 4 hours
- Tomorrow (next morning)

The reminder re-enters a **Snoozed** state and will trigger again at the selected time.

## macOS Reminders sync

DevDash can sync your reminders to a **"DevDash" list** in the macOS Reminders app, making them visible system-wide.

### Enabling sync
1. Open **Settings → General**.
2. Under **Reminders**, enable **Sync triggered reminders to macOS Reminders**.

Once enabled, new reminders created in DevDash are automatically added to macOS Reminders with the same title, due date, and notes.

### Bidirectional completion
If you mark a DevDash reminder as complete **in macOS Reminders**, DevDash will detect this during its periodic sync (every 10 minutes) and mark the reminder as **Dismissed** automatically.

### Limitations

- Dismissing a reminder in DevDash does **not** complete it in macOS Reminders
- Snoozing in DevDash does not update the due date in macOS Reminders
- Reminders are matched by exact title — renaming a reminder in macOS may break the link
- The sync list is limited to 100 incomplete reminders for performance

### macOS permissions

On first use, macOS will prompt DevDash for access to the Reminders app. Grant **Full Access** to allow two-way sync.

<!-- screenshot placeholder: macOS permissions prompt for Reminders access -->

## Filtering and sorting

The Reminders page sidebar filters by status:

| Filter | Shows |
|--------|-------|
| All | Everything |
| Pending | Scheduled, not yet due |
| Triggered | Past-due and unaddressed |
| Snoozed | Temporarily deferred |
| Dismissed | Last 30 days of completed reminders |

Within each group, reminders are sorted by scheduled time ascending (earliest first).
