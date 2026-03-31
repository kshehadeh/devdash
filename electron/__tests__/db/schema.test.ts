import { MIGRATIONS, runMigrations } from "../../db/schema";
import { createTestDb } from "../helpers/test-db";

describe("schema migrations", () => {
  it("runs all migrations cleanly on an empty database", () => {
    const db = createTestDb();
    expect(db.open).toBe(true);
    db.close();
  });

  it("sets schema_version to the latest migration index", () => {
    const db = createTestDb();
    const row = db.prepare("SELECT version FROM schema_version LIMIT 1").get() as { version: number };
    expect(row.version).toBe(MIGRATIONS.length - 1);
    db.close();
  });

  it("creates core tables", () => {
    const db = createTestDb();
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);

    const expected = [
      "developers",
      "connections",
      "config",
      "schema_version",
      "cached_contributions",
      "cached_pull_requests",
      "cached_jira_tickets",
      "cached_confluence_pages",
      "cached_linear_issues",
      "notifications",
      "reminders",
    ];
    for (const table of expected) {
      expect(names).toContain(table);
    }
    db.close();
  });

  it("migrations are idempotent (calling createTestDb twice does not error)", () => {
    const db1 = createTestDb();
    db1.close();
    const db2 = createTestDb();
    expect(db2.open).toBe(true);
    db2.close();
  });

  it("runMigrations is a no-op when already at latest version", () => {
    const db = createTestDb();
    // Running again should not throw
    runMigrations(db);
    const row = db.prepare("SELECT version FROM schema_version LIMIT 1").get() as { version: number };
    expect(row.version).toBe(MIGRATIONS.length - 1);
    db.close();
  });

  it("has 22 migrations total", () => {
    expect(MIGRATIONS).toHaveLength(22);
  });
});
