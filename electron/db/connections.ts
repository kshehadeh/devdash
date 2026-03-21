import { getDb } from "./index";
import { encrypt, decrypt } from "./crypto";

export type ConnectionId = "github" | "atlassian";

export interface ConnectionRecord {
  id: ConnectionId;
  token?: string;        // decrypted
  email?: string;
  org?: string;
  connected: boolean;
  updatedAt: string;
}

interface DbRow {
  id: string;
  encrypted_token: string | null;
  email: string | null;
  org: string | null;
  connected: number;
  updated_at: string;
}

function rowToModel(row: DbRow): ConnectionRecord {
  return {
    id: row.id as ConnectionId,
    token: row.encrypted_token ? decrypt(row.encrypted_token) : undefined,
    email: row.email ?? undefined,
    org: row.org ?? undefined,
    connected: row.connected === 1,
    updatedAt: row.updated_at,
  };
}

export function getConnection(id: ConnectionId): ConnectionRecord | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM connections WHERE id = ?").get(id) as DbRow | undefined;
  return row ? rowToModel(row) : null;
}

export function listConnections(): ConnectionRecord[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM connections").all() as DbRow[];
  return rows.map(rowToModel);
}

export function saveConnection(
  id: ConnectionId,
  input: { token?: string; email?: string; org?: string; connected?: boolean }
): ConnectionRecord {
  const db = getDb();
  const existing = getConnection(id);

  const encryptedToken = input.token
    ? encrypt(input.token)
    : (existing?.token ? encrypt(existing.token) : null);

  const connected = input.connected !== undefined ? (input.connected ? 1 : 0) : (existing?.connected ? 1 : 0);

  db.prepare(
    `INSERT INTO connections (id, encrypted_token, email, org, connected, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       encrypted_token = excluded.encrypted_token,
       email = excluded.email,
       org = excluded.org,
       connected = excluded.connected,
       updated_at = excluded.updated_at`
  ).run(
    id,
    encryptedToken,
    input.email ?? existing?.email ?? null,
    input.org ?? existing?.org ?? null,
    connected
  );

  return getConnection(id)!;
}

export function deleteConnection(id: ConnectionId): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM connections WHERE id = ?").run(id);
  return result.changes > 0;
}
