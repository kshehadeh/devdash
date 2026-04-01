import type Database from "better-sqlite3";
import { _setDbForTesting } from "../../db/index";
import {
  getSyncStatus,
  getAllSyncStatuses,
  hasFreshCache,
  getCachedContributions,
  getCachedCommitsYTD,
} from "../../db/cache";
import { createTestDb, seedTestDeveloper } from "../helpers/test-db";

let db: Database.Database;
let devId: string;

beforeEach(() => {
  db = createTestDb();
  _setDbForTesting(db);
  devId = seedTestDeveloper(db);
});

afterEach(() => {
  _setDbForTesting(null);
  db.close();
});

// ─── Sync Status ──────────────────────────────────────────

describe("getSyncStatus", () => {
  it("returns null when no entry exists", () => {
    expect(getSyncStatus(devId, "github_contributions")).toBeNull();
  });

  it("returns correct entry when seeded", () => {
    db.prepare(
      `INSERT INTO sync_log (developer_id, data_type, last_synced_at, status, error_message)
       VALUES (?, ?, datetime('now'), 'ok', NULL)`,
    ).run(devId, "github_contributions");

    const entry = getSyncStatus(devId, "github_contributions");
    expect(entry).not.toBeNull();
    expect(entry!.status).toBe("ok");
    expect(entry!.errorMessage).toBeNull();
  });

  it("returns error status with message", () => {
    db.prepare(
      `INSERT INTO sync_log (developer_id, data_type, last_synced_at, status, error_message)
       VALUES (?, ?, datetime('now'), 'error', 'rate limited')`,
    ).run(devId, "github_contributions");

    const entry = getSyncStatus(devId, "github_contributions");
    expect(entry!.status).toBe("error");
    expect(entry!.errorMessage).toBe("rate limited");
  });
});

describe("getAllSyncStatuses", () => {
  it("returns empty object when no entries exist", () => {
    expect(getAllSyncStatuses(devId)).toEqual({});
  });

  it("returns all entries keyed by data_type", () => {
    db.prepare(
      `INSERT INTO sync_log (developer_id, data_type, last_synced_at, status) VALUES (?, ?, datetime('now'), 'ok')`,
    ).run(devId, "github_contributions");
    db.prepare(
      `INSERT INTO sync_log (developer_id, data_type, last_synced_at, status, error_message) VALUES (?, ?, datetime('now'), 'error', 'fail')`,
    ).run(devId, "github_pull_requests");

    const statuses = getAllSyncStatuses(devId);
    expect(Object.keys(statuses)).toHaveLength(2);
    expect(statuses["github_contributions"]!.status).toBe("ok");
    expect(statuses["github_pull_requests"]!.status).toBe("error");
    expect(statuses["github_pull_requests"]!.errorMessage).toBe("fail");
  });

  it("does not include entries from other developers", () => {
    const otherId = seedTestDeveloper(db, { id: "other-dev" });
    db.prepare(
      `INSERT INTO sync_log (developer_id, data_type, last_synced_at, status) VALUES (?, ?, datetime('now'), 'ok')`,
    ).run(otherId, "github_contributions");

    expect(getAllSyncStatuses(devId)).toEqual({});
  });
});

describe("hasFreshCache", () => {
  it('returns true when status is "ok"', () => {
    db.prepare(
      `INSERT INTO sync_log (developer_id, data_type, last_synced_at, status) VALUES (?, ?, datetime('now'), 'ok')`,
    ).run(devId, "github_contributions");

    expect(hasFreshCache(devId, "github_contributions")).toBe(true);
  });

  it('returns false when status is "error"', () => {
    db.prepare(
      `INSERT INTO sync_log (developer_id, data_type, last_synced_at, status, error_message) VALUES (?, ?, datetime('now'), 'error', 'err')`,
    ).run(devId, "github_contributions");

    expect(hasFreshCache(devId, "github_contributions")).toBe(false);
  });

  it("returns false when no entry exists", () => {
    expect(hasFreshCache(devId, "github_contributions")).toBe(false);
  });

  it('returns false when status is "syncing"', () => {
    db.prepare(
      `INSERT INTO sync_log (developer_id, data_type, last_synced_at, status) VALUES (?, ?, datetime('now'), 'syncing')`,
    ).run(devId, "github_contributions");

    expect(hasFreshCache(devId, "github_contributions")).toBe(false);
  });
});

// ─── Contributions ────────────────────────────────────────

describe("getCachedContributions", () => {
  it("returns null when cache is not fresh", () => {
    expect(getCachedContributions(devId)).toBeNull();
  });

  it("returns sorted contributions when cache is fresh", () => {
    db.prepare(
      `INSERT INTO sync_log (developer_id, data_type, last_synced_at, status) VALUES (?, ?, datetime('now'), 'ok')`,
    ).run(devId, "github_contributions");

    db.prepare(
      `INSERT INTO cached_contributions (developer_id, date, count) VALUES (?, ?, ?)`,
    ).run(devId, "2024-03-15", 5);
    db.prepare(
      `INSERT INTO cached_contributions (developer_id, date, count) VALUES (?, ?, ?)`,
    ).run(devId, "2024-03-10", 3);
    db.prepare(
      `INSERT INTO cached_contributions (developer_id, date, count) VALUES (?, ?, ?)`,
    ).run(devId, "2024-03-20", 8);

    const result = getCachedContributions(devId);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(3);
    // Should be sorted by date ASC
    expect(result![0].date).toBe("2024-03-10");
    expect(result![1].date).toBe("2024-03-15");
    expect(result![2].date).toBe("2024-03-20");
    expect(result![0].count).toBe(3);
    expect(result![2].count).toBe(8);
  });

  it("returns empty array when fresh but no contributions", () => {
    db.prepare(
      `INSERT INTO sync_log (developer_id, data_type, last_synced_at, status) VALUES (?, ?, datetime('now'), 'ok')`,
    ).run(devId, "github_contributions");

    const result = getCachedContributions(devId);
    expect(result).toEqual([]);
  });
});

describe("getCachedCommitsYTD", () => {
  it("returns 0 when no contributions exist", () => {
    expect(getCachedCommitsYTD(devId)).toBe(0);
  });

  it("sums contributions for the current year", () => {
    const thisYear = new Date().getFullYear();
    db.prepare(
      `INSERT INTO cached_contributions (developer_id, date, count) VALUES (?, ?, ?)`,
    ).run(devId, `${thisYear}-01-15`, 10);
    db.prepare(
      `INSERT INTO cached_contributions (developer_id, date, count) VALUES (?, ?, ?)`,
    ).run(devId, `${thisYear}-06-20`, 25);

    expect(getCachedCommitsYTD(devId)).toBe(35);
  });

  it("excludes contributions from previous years", () => {
    const thisYear = new Date().getFullYear();
    const lastYear = thisYear - 1;
    db.prepare(
      `INSERT INTO cached_contributions (developer_id, date, count) VALUES (?, ?, ?)`,
    ).run(devId, `${lastYear}-12-31`, 100);
    db.prepare(
      `INSERT INTO cached_contributions (developer_id, date, count) VALUES (?, ?, ?)`,
    ).run(devId, `${thisYear}-01-01`, 7);

    expect(getCachedCommitsYTD(devId)).toBe(7);
  });

  it("does not require fresh cache to return data", () => {
    const thisYear = new Date().getFullYear();
    db.prepare(
      `INSERT INTO cached_contributions (developer_id, date, count) VALUES (?, ?, ?)`,
    ).run(devId, `${thisYear}-03-01`, 12);

    // No sync_log entry — getCachedCommitsYTD doesn't check freshness
    expect(getCachedCommitsYTD(devId)).toBe(12);
  });
});
