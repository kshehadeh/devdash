import { randomUUID } from "crypto";
import { getDb } from "./index";

export type ReminderStatus = "pending" | "triggered" | "dismissed" | "snoozed";

export interface ReminderRecord {
  id: string;
  developerId: string;
  notificationId: string | null;
  title: string;
  comment: string;
  sourceUrl: string | null;
  remindAt: string;
  status: ReminderStatus;
  snoozedUntil: string | null;
  syncedToMacos: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ReminderDbRow {
  id: string;
  developer_id: string;
  notification_id: string | null;
  title: string;
  comment: string;
  source_url: string | null;
  remind_at: string;
  status: ReminderStatus;
  snoozed_until: string | null;
  synced_to_macos: number;
  created_at: string;
  updated_at: string;
}

export interface CreateReminderInput {
  developerId: string;
  notificationId?: string | null;
  title: string;
  comment?: string;
  sourceUrl?: string | null;
  remindAt: string;
}

export interface UpdateReminderInput {
  title?: string;
  comment?: string;
  remindAt?: string;
}

export interface ListRemindersOptions {
  status?: ReminderStatus;
  limit?: number;
}

function mapRow(row: ReminderDbRow): ReminderRecord {
  return {
    id: row.id,
    developerId: row.developer_id,
    notificationId: row.notification_id,
    title: row.title,
    comment: row.comment,
    sourceUrl: row.source_url,
    remindAt: row.remind_at,
    status: row.status,
    snoozedUntil: row.snoozed_until,
    syncedToMacos: row.synced_to_macos === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createReminder(input: CreateReminderInput): ReminderRecord {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO reminders (
      id, developer_id, notification_id, title, comment, source_url, remind_at, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
  ).run(
    id,
    input.developerId,
    input.notificationId ?? null,
    input.title,
    input.comment ?? "",
    input.sourceUrl ?? null,
    input.remindAt,
  );

  const inserted = db.prepare("SELECT * FROM reminders WHERE id = ?").get(id) as ReminderDbRow | undefined;
  if (!inserted) throw new Error("Failed to create reminder");
  return mapRow(inserted);
}

export function listReminders(developerId: string, opts?: ListRemindersOptions): ReminderRecord[] {
  const db = getDb();
  const limit = opts?.limit ?? 100;
  let query = "SELECT * FROM reminders WHERE developer_id = ?";
  const params: unknown[] = [developerId];

  if (opts?.status) {
    query += " AND status = ?";
    params.push(opts.status);
  }

  query += " ORDER BY datetime(remind_at) ASC LIMIT ?";
  params.push(limit);

  const rows = db.prepare(query).all(...params) as ReminderDbRow[];
  return rows.map(mapRow);
}

export function getReminderById(id: string): ReminderRecord | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM reminders WHERE id = ?").get(id) as ReminderDbRow | undefined;
  return row ? mapRow(row) : null;
}

export function updateReminderStatus(
  id: string,
  status: ReminderStatus,
  snoozedUntil?: string | null,
): boolean {
  const db = getDb();
  const result = db.prepare(
    "UPDATE reminders SET status = ?, snoozed_until = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(status, snoozedUntil ?? null, id);
  return result.changes > 0;
}

export function updateReminder(id: string, input: UpdateReminderInput): boolean {
  const db = getDb();
  const updates: string[] = [];
  const params: unknown[] = [];

  if (input.title !== undefined) {
    updates.push("title = ?");
    params.push(input.title);
  }
  if (input.comment !== undefined) {
    updates.push("comment = ?");
    params.push(input.comment);
  }
  if (input.remindAt !== undefined) {
    updates.push("remind_at = ?");
    params.push(input.remindAt);
  }

  if (updates.length === 0) return false;

  updates.push("updated_at = datetime('now')");
  params.push(id);

  const result = db.prepare(
    `UPDATE reminders SET ${updates.join(", ")} WHERE id = ?`,
  ).run(...params);
  return result.changes > 0;
}

export function getTriggeredReminderCount(developerId: string): number {
  const db = getDb();
  const row = db.prepare(
    "SELECT COUNT(*) as count FROM reminders WHERE developer_id = ? AND status = 'triggered'",
  ).get(developerId) as { count: number };
  return row.count;
}

export function getDueReminders(): ReminderRecord[] {
  const db = getDb();
  const rows = db.prepare(
    `SELECT * FROM reminders 
     WHERE (
       (status = 'pending' AND datetime(remind_at) <= datetime('now')) OR
       (status = 'snoozed' AND datetime(snoozed_until) <= datetime('now'))
     )
     ORDER BY datetime(remind_at) ASC`,
  ).all() as ReminderDbRow[];
  return rows.map(mapRow);
}

export function markReminderSyncedToMacOS(id: string, synced: boolean): boolean {
  const db = getDb();
  const result = db.prepare(
    "UPDATE reminders SET synced_to_macos = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(synced ? 1 : 0, id);
  return result.changes > 0;
}

export function deleteReminder(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM reminders WHERE id = ?").run(id);
  return result.changes > 0;
}
