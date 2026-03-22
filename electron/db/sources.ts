import { randomUUID } from "crypto";
import { getDb } from "./index";
import type { DataSource, DataSourceType } from "../types";

function defaultProviderForType(type: DataSourceType): string | null {
  switch (type) {
    case "github_repo":
      return "github";
    case "jira_project":
      return "jira";
    case "confluence_space":
      return "confluence";
    case "linear_team":
      return "linear";
    default:
      return null;
  }
}

interface DbRow {
  id: string;
  type: string;
  provider_id: string | null;
  name: string;
  org: string;
  identifier: string;
  metadata: string;
  created_at: string;
  updated_at: string;
}

function rowToModel(row: DbRow): DataSource {
  let metadata = {};
  try {
    metadata = JSON.parse(row.metadata);
  } catch {
    /* ignore */
  }
  return {
    id: row.id,
    type: row.type as DataSourceType,
    providerId: row.provider_id ?? undefined,
    name: row.name,
    org: row.org,
    identifier: row.identifier,
    metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listSources(type?: DataSourceType): DataSource[] {
  const db = getDb();
  if (type) {
    return (db.prepare("SELECT * FROM data_sources WHERE type = ? ORDER BY name ASC").all(type) as DbRow[]).map(rowToModel);
  }
  return (db.prepare("SELECT * FROM data_sources ORDER BY type, name ASC").all() as DbRow[]).map(rowToModel);
}

export function getSource(id: string): DataSource | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM data_sources WHERE id = ?").get(id) as DbRow | undefined;
  return row ? rowToModel(row) : null;
}

export function createSource(input: {
  type: DataSourceType;
  name: string;
  org: string;
  identifier: string;
  metadata?: Record<string, unknown>;
  providerId?: string | null;
}): DataSource {
  const db = getDb();
  const id = randomUUID();
  const providerId = input.providerId ?? defaultProviderForType(input.type);
  db.prepare(
    `INSERT INTO data_sources (id, type, provider_id, name, org, identifier, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.type, providerId, input.name, input.org, input.identifier, JSON.stringify(input.metadata ?? {}));
  return getSource(id)!;
}

export function updateSource(
  id: string,
  input: { name?: string; org?: string; identifier?: string; metadata?: Record<string, unknown>; providerId?: string | null },
): DataSource | null {
  const db = getDb();
  const existing = getSource(id);
  if (!existing) return null;

  db.prepare(
    `UPDATE data_sources
     SET name = ?, org = ?, identifier = ?, metadata = ?, provider_id = COALESCE(?, provider_id), updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    input.name ?? existing.name,
    input.org ?? existing.org,
    input.identifier ?? existing.identifier,
    input.metadata ? JSON.stringify(input.metadata) : JSON.stringify(existing.metadata),
    input.providerId !== undefined ? input.providerId : null,
    id,
  );
  return getSource(id);
}

export function deleteSource(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM data_sources WHERE id = ?").run(id);
  return result.changes > 0;
}

// --- Developer-source associations ---

export function getSourcesForDeveloper(developerId: string): DataSource[] {
  const db = getDb();
  const rows = db.prepare(
    `SELECT ds.* FROM data_sources ds
     INNER JOIN developer_sources dsa ON dsa.source_id = ds.id
     WHERE dsa.developer_id = ?
     ORDER BY ds.type, ds.name ASC`
  ).all(developerId) as DbRow[];
  return rows.map(rowToModel);
}

export function getDeveloperIdsForSource(sourceId: string): string[] {
  const db = getDb();
  const rows = db.prepare("SELECT developer_id FROM developer_sources WHERE source_id = ?").all(sourceId) as { developer_id: string }[];
  return rows.map((r) => r.developer_id);
}

export function setSourcesForDeveloper(developerId: string, sourceIds: string[]): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM developer_sources WHERE developer_id = ?").run(developerId);
    const insert = db.prepare("INSERT INTO developer_sources (developer_id, source_id) VALUES (?, ?)");
    for (const sourceId of sourceIds) {
      insert.run(developerId, sourceId);
    }
  });
  tx();
}

export function addSourceToDeveloper(developerId: string, sourceId: string): void {
  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO developer_sources (developer_id, source_id) VALUES (?, ?)").run(developerId, sourceId);
}

export function removeSourceFromDeveloper(developerId: string, sourceId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM developer_sources WHERE developer_id = ? AND source_id = ?").run(developerId, sourceId);
}
