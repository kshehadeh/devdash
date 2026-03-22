import type Database from "better-sqlite3";
import { getDb } from "./index";

/** Logical sync/cache buckets: matches `sync_log.data_type` and sync-registry task ids. */
export const CACHE_BUCKET_DEFS = [
  {
    id: "github_contributions",
    label: "GitHub contributions",
    description: "Contribution calendar (commit counts per day).",
    tables: ["cached_contributions"] as const,
  },
  {
    id: "github_pull_requests",
    label: "GitHub pull requests",
    description: "Authored PRs, review queue, and PR review signals.",
    tables: ["cached_pull_requests", "cached_review_requests"] as const,
  },
  {
    id: "jira_tickets",
    label: "Jira tickets",
    description: "Cached Jira issues for assigned projects.",
    tables: ["cached_jira_tickets", "cached_completed_tickets"] as const,
  },
  {
    id: "linear_issues",
    label: "Linear issues",
    description: "Cached Linear issues for assigned teams.",
    tables: ["cached_linear_issues"] as const,
  },
  {
    id: "confluence_pages",
    label: "Confluence pages",
    description: "Cached Confluence page metadata and activity.",
    tables: ["cached_confluence_pages"] as const,
  },
] as const;

export type CacheBucketId = (typeof CACHE_BUCKET_DEFS)[number]["id"];

export interface CacheBucketStats {
  id: CacheBucketId;
  label: string;
  description: string;
  rowCount: number;
  /** B-tree pages for table + its indexes; null if unavailable in this SQLite build. */
  storageBytes: number | null;
}

export interface CacheStatsResponse {
  buckets: CacheBucketStats[];
  /** Whole SQLite file size from page_count × page_size (not sum of buckets). */
  databaseFileBytes: number | null;
}

function storageBytesForTable(db: Database.Database, tbl: string): number | null {
  try {
    const row = db
      .prepare(
        `SELECT COALESCE(SUM(d.pgsize), 0) AS b
         FROM dbstat AS d
         WHERE d.name IN (
           SELECT name FROM sqlite_master
           WHERE tbl_name = ? AND type IN ('table', 'index')
         )`,
      )
      .get(tbl) as { b: number };
    return row.b;
  } catch {
    return null;
  }
}

function rowCountForTable(db: Database.Database, tbl: string): number {
  try {
    const row = db.prepare(`SELECT COUNT(*) AS c FROM ${quoteIdent(tbl)}`).get() as { c: number };
    return row.c;
  } catch {
    return 0;
  }
}

/** SQLite identifier — only trusted table names from CACHE_BUCKET_DEFS. */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function databaseFileBytes(db: Database.Database): number | null {
  try {
    const row = db
      .prepare(`SELECT page_count * page_size AS sz FROM pragma_page_count(), pragma_page_size()`)
      .get() as { sz: number };
    return row.sz;
  } catch {
    return null;
  }
}

export function getCacheStats(): CacheStatsResponse {
  const db = getDb();
  const buckets: CacheBucketStats[] = CACHE_BUCKET_DEFS.map((def) => {
    let rowCount = 0;
    let storageBytes: number | null = 0;
    for (const tbl of def.tables) {
      rowCount += rowCountForTable(db, tbl);
      const b = storageBytesForTable(db, tbl);
      if (b === null) storageBytes = null;
      else if (storageBytes !== null) storageBytes += b;
    }
    return {
      id: def.id,
      label: def.label,
      description: def.description,
      rowCount,
      storageBytes,
    };
  });
  return { buckets, databaseFileBytes: databaseFileBytes(db) };
}

export function clearCacheBucket(bucketId: CacheBucketId): void {
  const def = CACHE_BUCKET_DEFS.find((d) => d.id === bucketId);
  if (!def) throw new Error(`Unknown cache bucket: ${bucketId}`);

  const db = getDb();
  db.transaction(() => {
    for (const tbl of def.tables) {
      db.prepare(`DELETE FROM ${quoteIdent(tbl)}`).run();
    }
    db.prepare(`DELETE FROM sync_log WHERE data_type = ?`).run(bucketId);
  })();
}

export function clearAllCaches(): void {
  const db = getDb();
  db.transaction(() => {
    for (const def of CACHE_BUCKET_DEFS) {
      for (const tbl of def.tables) {
        db.prepare(`DELETE FROM ${quoteIdent(tbl)}`).run();
      }
    }
    db.prepare(`DELETE FROM sync_log WHERE data_type IN (${CACHE_BUCKET_DEFS.map(() => "?").join(",")})`).run(
      ...CACHE_BUCKET_DEFS.map((d) => d.id),
    );
  })();
}
