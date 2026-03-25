import { randomUUID } from "crypto";
import { getDb } from "./index";

export type NotificationStatus = "new" | "read";

export interface NotificationRecord {
  id: string;
  developerId: string;
  integration: string;
  notificationType: string;
  fingerprint: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  sourceUrl: string | null;
  status: NotificationStatus;
  eventUpdatedAt: string;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationPreference {
  integration: string;
  notificationType: string;
  enabled: boolean;
  fingerprintStrategy: Record<string, unknown>;
  updatedAt: string;
}

interface NotificationDbRow {
  id: string;
  developer_id: string;
  integration: string;
  notification_type: string;
  fingerprint: string;
  title: string;
  body: string;
  payload_json: string;
  source_url: string | null;
  status: NotificationStatus;
  event_updated_at: string;
  created_at: string;
  read_at: string | null;
}

interface NotificationPreferenceRow {
  integration: string;
  notification_type: string;
  enabled: number;
  fingerprint_strategy_json: string;
  updated_at: string;
}

export interface UpsertNotificationInput {
  developerId: string;
  integration: string;
  notificationType: string;
  fingerprint: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  sourceUrl?: string | null;
  eventUpdatedAt: string;
}

function safeParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function mapRow(row: NotificationDbRow): NotificationRecord {
  return {
    id: row.id,
    developerId: row.developer_id,
    integration: row.integration,
    notificationType: row.notification_type,
    fingerprint: row.fingerprint,
    title: row.title,
    body: row.body,
    payload: safeParse<Record<string, unknown>>(row.payload_json, {}),
    sourceUrl: row.source_url,
    status: row.status,
    eventUpdatedAt: row.event_updated_at,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

function mapPreference(row: NotificationPreferenceRow): NotificationPreference {
  return {
    integration: row.integration,
    notificationType: row.notification_type,
    enabled: row.enabled === 1,
    fingerprintStrategy: safeParse<Record<string, unknown>>(row.fingerprint_strategy_json, {}),
    updatedAt: row.updated_at,
  };
}

export function upsertNotificationIfNew(input: UpsertNotificationInput): NotificationRecord | null {
  const db = getDb();
  const existing = db.prepare(
    `SELECT *
     FROM notifications
     WHERE developer_id = ? AND integration = ? AND notification_type = ? AND fingerprint = ?`,
  ).get(input.developerId, input.integration, input.notificationType, input.fingerprint) as NotificationDbRow | undefined;
  if (existing) return null;

  const id = randomUUID();
  db.prepare(
    `INSERT INTO notifications (
      id, developer_id, integration, notification_type, fingerprint, title, body, payload_json, source_url,
      status, event_updated_at, created_at, read_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, datetime('now'), NULL)`,
  ).run(
    id,
    input.developerId,
    input.integration,
    input.notificationType,
    input.fingerprint,
    input.title,
    input.body,
    JSON.stringify(input.payload ?? {}),
    input.sourceUrl ?? null,
    input.eventUpdatedAt,
  );

  const inserted = db.prepare("SELECT * FROM notifications WHERE id = ?").get(id) as NotificationDbRow | undefined;
  return inserted ? mapRow(inserted) : null;
}

export function listNotifications(limit = 50): NotificationRecord[] {
  const db = getDb();
  const rows = db.prepare(
    `SELECT *
     FROM notifications
     ORDER BY CASE WHEN status = 'new' THEN 0 ELSE 1 END ASC, datetime(created_at) DESC
     LIMIT ?`,
  ).all(limit) as NotificationDbRow[];
  return rows.map(mapRow);
}

export function listNotificationsForDeveloper(developerId: string, limit = 50): NotificationRecord[] {
  const db = getDb();
  const rows = db.prepare(
    `SELECT *
     FROM notifications
     WHERE developer_id = ? AND integration != 'reminder'
     ORDER BY CASE WHEN status = 'new' THEN 0 ELSE 1 END ASC, datetime(created_at) DESC
     LIMIT ?`,
  ).all(developerId, limit) as NotificationDbRow[];
  return rows.map(mapRow);
}

export function getNotificationById(id: string): NotificationRecord | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM notifications WHERE id = ?").get(id) as NotificationDbRow | undefined;
  return row ? mapRow(row) : null;
}

export function markNotificationRead(id: string): boolean {
  const db = getDb();
  const result = db.prepare(
    "UPDATE notifications SET status = 'read', read_at = datetime('now') WHERE id = ? AND status = 'new'",
  ).run(id);
  return result.changes > 0;
}

export function markAllNotificationsRead(developerId?: string): number {
  const db = getDb();
  if (developerId) {
    return db.prepare(
      "UPDATE notifications SET status = 'read', read_at = datetime('now') WHERE developer_id = ? AND status = 'new'",
    ).run(developerId).changes;
  }
  return db.prepare(
    "UPDATE notifications SET status = 'read', read_at = datetime('now') WHERE status = 'new'",
  ).run().changes;
}

export interface NotificationSourceGroup {
  sourceItemKey: string;
  sourceLabel: string;
  sourceUrl: string | null;
  count: number;
  unreadCount: number;
  latestAt: string;
  notifications: NotificationRecord[];
}

export interface NotificationGroup {
  notificationType: string;
  integration: string;
  count: number;
  unreadCount: number;
  sourceGroups: NotificationSourceGroup[];
}

export interface SourceItemKeyFn {
  sourceItemKey: (record: NotificationRecord) => string;
  sourceItemLabel: (record: NotificationRecord) => string;
}

export function groupedNotificationsForDeveloper(
  developerId: string,
  keyFns: Map<string, SourceItemKeyFn>,
  limit = 200,
): NotificationGroup[] {
  const db = getDb();
  const rows = db.prepare(
    `SELECT * FROM notifications WHERE developer_id = ? ORDER BY datetime(created_at) DESC LIMIT ?`,
  ).all(developerId, limit) as NotificationDbRow[];
  const all = rows.map(mapRow);

  const typeMap = new Map<string, { integration: string; records: NotificationRecord[] }>();
  for (const n of all) {
    if (!typeMap.has(n.notificationType)) {
      typeMap.set(n.notificationType, { integration: n.integration, records: [] });
    }
    typeMap.get(n.notificationType)!.records.push(n);
  }

  const groups: NotificationGroup[] = [];
  for (const [notificationType, { integration, records }] of typeMap) {
    const fns = keyFns.get(notificationType);

    const sourceMap = new Map<string, NotificationSourceGroup>();
    for (const n of records) {
      const key = fns ? fns.sourceItemKey(n) : n.title;
      const label = fns ? fns.sourceItemLabel(n) : n.title;
      if (!sourceMap.has(key)) {
        sourceMap.set(key, {
          sourceItemKey: key,
          sourceLabel: label,
          sourceUrl: n.sourceUrl,
          count: 0,
          unreadCount: 0,
          latestAt: n.createdAt,
          notifications: [],
        });
      }
      const sg = sourceMap.get(key)!;
      sg.count++;
      if (n.status === "new") sg.unreadCount++;
      if (new Date(n.createdAt) > new Date(sg.latestAt)) sg.latestAt = n.createdAt;
      sg.notifications.push(n);
    }

    // Sort notifications within each source group: unread first, then most recent.
    for (const sg of sourceMap.values()) {
      sg.notifications.sort((a, b) => {
        if (a.status === b.status) return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        return a.status === "new" ? -1 : 1;
      });
    }

    // Sort source groups: unread first, then most recent activity.
    const sourceGroups = Array.from(sourceMap.values()).sort((a, b) => {
      if (a.unreadCount > 0 !== b.unreadCount > 0) return a.unreadCount > 0 ? -1 : 1;
      return new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime();
    });

    const count = sourceGroups.reduce((s, sg) => s + sg.count, 0);
    const unreadCount = sourceGroups.reduce((s, sg) => s + sg.unreadCount, 0);
    groups.push({ notificationType, integration, count, unreadCount, sourceGroups });
  }

  return groups;
}

export function markGroupRead(developerId: string, notificationType: string): number {
  const db = getDb();
  return db.prepare(
    "UPDATE notifications SET status = 'read', read_at = datetime('now') WHERE developer_id = ? AND notification_type = ? AND status = 'new'",
  ).run(developerId, notificationType).changes;
}

export function markBatchRead(ids: string[]): number {
  if (!ids.length) return 0;
  const db = getDb();
  const placeholders = ids.map(() => "?").join(",");
  return db.prepare(
    `UPDATE notifications SET status = 'read', read_at = datetime('now') WHERE id IN (${placeholders}) AND status = 'new'`,
  ).run(...ids).changes;
}

export function getUnreadNotificationCount(developerId?: string): number {
  const db = getDb();
  // Exclude reminder notifications from the count
  const row = developerId
    ? db.prepare("SELECT COUNT(*) as count FROM notifications WHERE developer_id = ? AND status = 'new' AND integration != 'reminder'").get(developerId) as { count: number }
    : db.prepare("SELECT COUNT(*) as count FROM notifications WHERE status = 'new' AND integration != 'reminder'").get() as { count: number };
  return row.count;
}

export function getNotificationPreferences(): NotificationPreference[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT integration, notification_type, enabled, fingerprint_strategy_json, updated_at FROM notification_preferences ORDER BY integration, notification_type",
  ).all() as NotificationPreferenceRow[];
  return rows.map(mapPreference);
}

export function getNotificationPreference(
  integration: string,
  notificationType: string,
): NotificationPreference | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT integration, notification_type, enabled, fingerprint_strategy_json, updated_at FROM notification_preferences WHERE integration = ? AND notification_type = ?",
  ).get(integration, notificationType) as NotificationPreferenceRow | undefined;
  return row ? mapPreference(row) : null;
}

export function setNotificationPreference(input: {
  integration: string;
  notificationType: string;
  enabled: boolean;
  fingerprintStrategy?: Record<string, unknown>;
}): NotificationPreference {
  const db = getDb();
  db.prepare(
    `INSERT INTO notification_preferences (integration, notification_type, enabled, fingerprint_strategy_json, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(integration, notification_type) DO UPDATE SET
       enabled = excluded.enabled,
       fingerprint_strategy_json = excluded.fingerprint_strategy_json,
       updated_at = datetime('now')`,
  ).run(
    input.integration,
    input.notificationType,
    input.enabled ? 1 : 0,
    JSON.stringify(input.fingerprintStrategy ?? {}),
  );

  const pref = getNotificationPreference(input.integration, input.notificationType);
  if (!pref) throw new Error("Failed to persist notification preference");
  return pref;
}

export function ensureNotificationPreference(input: {
  integration: string;
  notificationType: string;
  defaultEnabled: boolean;
  fingerprintStrategy?: Record<string, unknown>;
}): NotificationPreference {
  const existing = getNotificationPreference(input.integration, input.notificationType);
  if (existing) return existing;
  return setNotificationPreference({
    integration: input.integration,
    notificationType: input.notificationType,
    enabled: input.defaultEnabled,
    fingerprintStrategy: input.fingerprintStrategy ?? {},
  });
}
