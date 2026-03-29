import { getDb } from "./index";
import type { IntegrationCategory } from "../integrations/types";
import { getDeveloper } from "./developers";

export interface DeveloperIntegrationIdentityExportRow {
  developerId: string;
  category: IntegrationCategory;
  providerId: string;
  payload: Record<string, unknown>;
}

interface Row {
  payload_json: string;
  provider_id: string;
}

function parsePayloadJson(payloadJson: string): Record<string, unknown> {
  try {
    const p = JSON.parse(payloadJson) as unknown;
    return p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** All per-developer integration identity rows (for settings export). */
export function listAllDeveloperIntegrationIdentities(): DeveloperIntegrationIdentityExportRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT developer_id, category, provider_id, payload_json FROM developer_integration_identity ORDER BY developer_id, category`,
    )
    .all() as { developer_id: string; category: string; provider_id: string; payload_json: string }[];
  const out: DeveloperIntegrationIdentityExportRow[] = [];
  for (const r of rows) {
    if (r.category !== "code" && r.category !== "work" && r.category !== "docs") continue;
    out.push({
      developerId: r.developer_id,
      category: r.category,
      providerId: r.provider_id,
      payload: parsePayloadJson(r.payload_json),
    });
  }
  return out;
}

/** Replace category row payload and provider (settings import). */
export function upsertDeveloperIntegrationIdentity(
  developerId: string,
  category: IntegrationCategory,
  providerId: string,
  payload: Record<string, unknown>,
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO developer_integration_identity (developer_id, category, provider_id, payload_json, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(developer_id, category) DO UPDATE SET
       provider_id = excluded.provider_id,
       payload_json = excluded.payload_json,
       updated_at = excluded.updated_at`,
  ).run(developerId, category, providerId, JSON.stringify(payload));
}

export function getIdentityPayload(developerId: string, category: IntegrationCategory): Record<string, unknown> {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT payload_json FROM developer_integration_identity WHERE developer_id = ? AND category = ?",
    )
    .get(developerId, category) as Row | undefined;
  if (!row?.payload_json) return {};
  return parsePayloadJson(row.payload_json);
}

/** Email used to match the developer in work tools (Jira picker, Linear assignee filter). */
export function getWorkEmailForDeveloper(developerId: string): string | undefined {
  const dev = getDeveloper(developerId);
  if (!dev) return undefined;
  const p = getIdentityPayload(developerId, "work") as { workEmail?: string };
  if (typeof p.workEmail === "string" && p.workEmail.trim()) return p.workEmail.trim();
  if (dev.atlassianEmail?.trim()) return dev.atlassianEmail.trim();
  return undefined;
}

export function ensureDeveloperIntegrationRows(developerId: string): void {
  const db = getDb();
  const ins = db.prepare(
    `INSERT OR IGNORE INTO developer_integration_identity (developer_id, category, provider_id, payload_json, updated_at)
     VALUES (?, ?, ?, '{}', datetime('now'))`,
  );
  ins.run(developerId, "code", "github");
  ins.run(developerId, "work", "jira");
  ins.run(developerId, "docs", "confluence");
}

export function mergeLegacyIdentityFromDeveloper(
  developerId: string,
  patch: { githubUsername?: string; atlassianEmail?: string },
): void {
  const db = getDb();
  if (patch.githubUsername !== undefined) {
    const payload = JSON.stringify(
      patch.githubUsername ? { githubUsername: patch.githubUsername } : {},
    );
    db.prepare(
      `INSERT INTO developer_integration_identity (developer_id, category, provider_id, payload_json, updated_at)
       VALUES (?, 'code', 'github', ?, datetime('now'))
       ON CONFLICT(developer_id, category) DO UPDATE SET
         payload_json = excluded.payload_json,
         updated_at = excluded.updated_at`,
    ).run(developerId, payload);
  }
  if (patch.atlassianEmail !== undefined) {
    const email = patch.atlassianEmail ?? "";
    const workPayload = email ? JSON.stringify({ workEmail: email }) : "{}";
    const docsPayload = email ? JSON.stringify({ atlassianEmail: email }) : "{}";
    db.prepare(
      `INSERT INTO developer_integration_identity (developer_id, category, provider_id, payload_json, updated_at)
       VALUES (?, 'work', 'jira', ?, datetime('now'))
       ON CONFLICT(developer_id, category) DO UPDATE SET
         payload_json = excluded.payload_json,
         updated_at = excluded.updated_at`,
    ).run(developerId, workPayload);
    db.prepare(
      `INSERT INTO developer_integration_identity (developer_id, category, provider_id, payload_json, updated_at)
       VALUES (?, 'docs', 'confluence', ?, datetime('now'))
       ON CONFLICT(developer_id, category) DO UPDATE SET
         payload_json = excluded.payload_json,
         updated_at = excluded.updated_at`,
    ).run(developerId, docsPayload);
  }
}
