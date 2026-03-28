---
name: add-notification-type
description: Guide for adding or modifying DevDash integration notification types. Use when implementing a new notification event (e.g. Jira/ GitHub/ Confluence), changing fingerprint dedupe strategy, adding settings toggles, or wiring desktop/in-app notification behavior.
user-invocable: true
---

# Add notification type skill

Use this skill when changing the **integration notification system**, not for generic status bar messages.

For architecture context, read [`docs/notifications.md`](../../../docs/notifications.md) first.

---

## Quick checklist

1. Define/modify the notification in [`electron/notifications/registry.ts`](../../../electron/notifications/registry.ts):
   - `integration`, `notificationType`, `label`
   - `defaultEnabled`
   - `strategy` metadata (`id`, `version`)
   - `poll(developerId)` implementation
   - `fingerprint(event)` implementation
2. Ensure the poller only fetches needed data from provider APIs (scoped JQL/search/filters).
3. Verify dedupe behavior for repeated events vs updated events.
4. Confirm preferences are auto-seeded in `notifications:preferences:get`.
5. Validate menu ordering/read transitions and desktop click open behavior.

---

## Files to touch

### Always relevant

- Registry and provider event logic:
  - [`electron/notifications/registry.ts`](../../../electron/notifications/registry.ts)
- Polling orchestration:
  - [`electron/notifications/service.ts`](../../../electron/notifications/service.ts)
- DB read/write helpers:
  - [`electron/db/notifications.ts`](../../../electron/db/notifications.ts)
- Notification docs:
  - [`docs/notifications.md`](../../../docs/notifications.md)

### Sometimes relevant

- Provider API helpers (if a new API query is needed):
  - [`electron/services/github.ts`](../../../electron/services/github.ts)
  - [`electron/services/atlassian.ts`](../../../electron/services/atlassian.ts)
- IPC surface:
  - [`electron/ipc/notifications.ts`](../../../electron/ipc/notifications.ts)
- Renderer behavior:
  - [`src/components/notifications/NotificationCenter.tsx`](../../../src/components/notifications/NotificationCenter.tsx)
  - [`src/pages/settings/Notifications.tsx`](../../../src/pages/settings/Notifications.tsx)
- Shared types:
  - [`src/lib/types.ts`](../../../src/lib/types.ts)
  - [`electron/types.ts`](../../../electron/types.ts)

---

## Definition design guidance

### Poll function

Keep pollers narrow and incremental:

- Filter to the current user context.
- Filter by assigned sources (repos/projects/spaces) where possible.
- Use recent windows or cursors when APIs support it.
- Fetch minimal fields needed to build notification title/body/payload/fingerprint.

### Fingerprint function

Fingerprint must be stable for a “same event” and change for a “meaningful update”.

Good patterns:

- GitHub review requested: `repo + prNumber + updatedAt`
- GitHub stale authored PR (cache-only): `repo + prNumber + updatedAt` while PR matches “open, zero reviews, age ≥ threshold”
- Jira ticket update: `issueKey + updatedAt`
- Comment-based signals: `issueKey + commentId + updatedAt`

When strategy semantics change:

- Increment `strategy.version`.
- Update `strategy.id` if shape/meaning changes materially.

### Payload

Include structured payload values needed for future routing or detail rendering (issue key, repo, ids) rather than only display text.

---

## DB and preference behavior

`upsertNotificationIfNew(...)` inserts only when `(developer_id, integration, notification_type, fingerprint)` is new.

Preference seeding happens from definitions in `notifications:preferences:get`:

- new definition appears automatically in settings on first load
- default enabled value comes from `defaultEnabled`
- strategy metadata is persisted in `fingerprint_strategy_json`

---

## UI expectations

- Bell icon is always present in header layouts.
- Badge count reflects unread count.
- Menu sorted unread first, newest first.
- Clicking a menu item marks it read and opens details modal.
- Desktop notification click follows the same open/read path.
- “Mark all read” updates unread count and state immediately.

---

## Verification steps

Run:

- `bun run electron:compile`
- `bun run build`

Manual checks:

1. Trigger the new event in provider system.
2. Confirm one inserted row appears in `notifications`.
3. Trigger same event without meaningful change -> no duplicate row.
4. Trigger updated event -> new row appears (if fingerprint changes).
5. Confirm desktop click opens modal and marks read.
6. Confirm menu click behavior and mark-all-read behavior.
