import { randomUUID } from "crypto";
import { getDb } from "./index";
import type { Developer } from "../types";
import { ensureDeveloperIntegrationRows, mergeLegacyIdentityFromDeveloper } from "./developer-identity";

interface DbRow {
  id: string;
  name: string;
  avatar: string;
  role: string;
  team: string;
  is_current_user: number;
  github_username: string | null;
  atlassian_email: string | null;
}

function rowToModel(row: DbRow): Developer {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    role: row.role,
    team: row.team,
    isCurrentUser: row.is_current_user === 1,
    githubUsername: row.github_username ?? undefined,
    atlassianEmail: row.atlassian_email ?? undefined,
  };
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export function listDevelopers(): Developer[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM developers ORDER BY created_at ASC").all() as DbRow[];
  return rows.map(rowToModel);
}

export function getDeveloper(id: string): Developer | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM developers WHERE id = ?").get(id) as DbRow | undefined;
  return row ? rowToModel(row) : null;
}

export function createDeveloper(input: {
  name: string;
  role: string;
  team: string;
  isCurrentUser?: boolean;
  githubUsername?: string;
  atlassianEmail?: string;
}): Developer {
  const db = getDb();
  const id = randomUUID();
  const avatar = initials(input.name);
  const create = db.transaction(() => {
    if (input.isCurrentUser) {
      db.prepare("UPDATE developers SET is_current_user = 0, updated_at = datetime('now') WHERE is_current_user = 1").run();
    }
    db.prepare(
      `INSERT INTO developers (id, name, avatar, role, team, is_current_user, github_username, atlassian_email)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.name,
      avatar,
      input.role,
      input.team,
      input.isCurrentUser ? 1 : 0,
      input.githubUsername ?? null,
      input.atlassianEmail ?? null
    );
  });
  create();
  ensureDeveloperIntegrationRows(id);
  mergeLegacyIdentityFromDeveloper(id, {
    githubUsername: input.githubUsername,
    atlassianEmail: input.atlassianEmail,
  });
  return getDeveloper(id)!;
}

export function updateDeveloper(
  id: string,
  input: {
    name?: string;
    role?: string;
    team?: string;
    isCurrentUser?: boolean;
    githubUsername?: string;
    atlassianEmail?: string;
  }
): Developer | null {
  const db = getDb();
  const existing = getDeveloper(id);
  if (!existing) return null;

  const name = input.name ?? existing.name;
  const avatar = input.name ? initials(input.name) : existing.avatar;
  const isCurrentUser = input.isCurrentUser ?? existing.isCurrentUser;

  const update = db.transaction(() => {
    if (isCurrentUser) {
      db.prepare("UPDATE developers SET is_current_user = 0, updated_at = datetime('now') WHERE id != ? AND is_current_user = 1").run(id);
    }
    db.prepare(
      `UPDATE developers
       SET name = ?, avatar = ?, role = ?, team = ?, is_current_user = ?, github_username = ?, atlassian_email = ?,
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      name,
      avatar,
      input.role ?? existing.role,
      input.team ?? existing.team,
      isCurrentUser ? 1 : 0,
      input.githubUsername !== undefined ? (input.githubUsername || null) : (existing.githubUsername ?? null),
      input.atlassianEmail !== undefined ? (input.atlassianEmail || null) : (existing.atlassianEmail ?? null),
      id
    );
  });
  update();
  mergeLegacyIdentityFromDeveloper(id, {
    githubUsername: input.githubUsername,
    atlassianEmail: input.atlassianEmail,
  });
  return getDeveloper(id);
}

export function deleteDeveloper(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM developers WHERE id = ?").run(id);
  return result.changes > 0;
}
