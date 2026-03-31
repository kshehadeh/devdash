import Database from "better-sqlite3";
import { MIGRATIONS } from "../../db/schema";

export function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Run migrations (same as runMigrations but without file backup logic)
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)",
  );
  db.prepare("INSERT OR IGNORE INTO schema_version (version) VALUES (?)").run(
    -1,
  );

  for (let i = 0; i < MIGRATIONS.length; i++) {
    db.exec(MIGRATIONS[i]);
    db.prepare("UPDATE schema_version SET version = ?").run(i);
  }

  return db;
}

export function seedTestDeveloper(
  db: Database.Database,
  overrides?: Partial<{
    id: string;
    name: string;
    githubUsername: string;
    atlassianEmail: string;
  }>,
): string {
  const id = overrides?.id ?? "test-dev-1";
  db.prepare(
    `
    INSERT OR REPLACE INTO developers (id, name, avatar, role, team, github_username, atlassian_email)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    id,
    overrides?.name ?? "Test Developer",
    "https://example.com/avatar.png",
    "Engineer",
    "Platform",
    overrides?.githubUsername ?? "testuser",
    overrides?.atlassianEmail ?? "test@example.com",
  );
  return id;
}

export function seedTestConnection(
  db: Database.Database,
  id: "github" | "atlassian" | "linear",
  token = "test-token-123",
): void {
  // Store token as plaintext for testing (no encryption needed in test context)
  db.prepare(
    `
    INSERT OR REPLACE INTO connections (id, encrypted_token, email, org, connected, updated_at)
    VALUES (?, ?, ?, ?, 1, datetime('now'))
  `,
  ).run(id, token, "test@example.com", "test-org");
}
