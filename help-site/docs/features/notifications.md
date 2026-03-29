---
sidebar_position: 5
title: Notifications
---

# Notifications

DevDash monitors your connected integrations for events that deserve your attention and surfaces them as in-app notifications — with optional native macOS desktop alerts. Every notification type is individually configurable so you only get alerted about what matters to you.

<!-- screenshot placeholder: notification center dropdown open with several notifications listed -->

## How notifications work

DevDash polls your integrations on a background interval (configurable in settings) and checks for new events. Each event type uses a **fingerprint** strategy to prevent duplicate notifications — if the same event fires twice, you'll only see it once.

New events are stored in DevDash's local database and appear in the **notification center** bell icon in the header. When a notification arrives, a native desktop alert fires and the bell badge increments.

## Notification center

Click the **bell icon** in the top bar to open the notification center. Notifications are sorted unread-first, then by most recent.

- Click any notification to open its detail view and mark it read
- Use **Mark all as read** to clear the badge without opening each one individually

<!-- screenshot placeholder: notification detail modal -->

## Built-in notification types

### GitHub: Review requested
Triggers when another developer requests your review on a pull request. Fires once per PR review request (deduplicated by PR and reviewer combination).

### GitHub: Stale PR
Triggers when one of your authored open pull requests has received zero reviews and has been open for longer than the configured stale threshold:

- **Warn** — default 3 days (configurable)
- **Danger** — default 7 days (configurable)

The dashboard PR list uses the same thresholds for its visual staleness indicators.

### Jira: Ticket updated
Fires when a Jira ticket you are assigned to or watching has been updated. Deduplicated by ticket key and update timestamp.

### Confluence: Page activity
Notifies you when a Confluence page in your tracked spaces has new activity.

## Configuring notifications

Open **Settings → Notifications** to customize the notification system.

<!-- screenshot placeholder: Settings → Notifications page -->

### Global toggle
**Enable notifications** turns the entire notification system on or off. When off, no polling runs, no native alerts fire, and the bell badge stays clear.

### Poll interval
How often DevDash checks for new events, in minutes. Lower values mean faster alerts but more API calls. Default is every 5 minutes.

### Per-type toggles
Each notification type has its own enable/disable toggle. Turn off types you find noisy without disabling the entire system.

### Stale PR thresholds
The number of days before a PR without reviews is flagged as stale (warn level) or very stale (danger level). These thresholds affect both notifications and the visual badges in the PR list on the dashboard.

## Desktop alerts

Native macOS notification banners appear when new events arrive. Clicking a desktop alert:

1. Brings the DevDash window to the foreground
2. Opens the notification detail directly

Desktop notifications are only active when DevDash is running. If you quit DevDash, alerts won't fire until you reopen the app and the next polling cycle completes.

:::note Development builds
In development builds, desktop notifications may appear under the name "Electron". Packaged release builds use the DevDash app identity.
:::
