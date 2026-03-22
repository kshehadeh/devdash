// @ts-nocheck — Linear GraphQL responses are loosely typed
import { getDb } from "../db/index";
import { getConnection } from "../db/connections";
import { getDeveloper } from "../db/developers";
import { getSourcesForDeveloper } from "../db/sources";
import { getWorkEmailForDeveloper } from "../db/developer-identity";
import { fetchLinearIssuesForAssignee } from "../services/linear";

function setSyncStatus(
  developerId: string,
  dataType: string,
  status: "ok" | "error" | "syncing",
  errorMessage?: string | null,
  cursor?: string | null,
): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO sync_log (developer_id, data_type, last_synced_at, last_cursor, status, error_message)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(developer_id, data_type) DO UPDATE SET
       last_synced_at = excluded.last_synced_at,
       last_cursor = excluded.last_cursor,
       status = excluded.status,
       error_message = excluded.error_message`,
  ).run(developerId, dataType, now, cursor ?? null, status, errorMessage ?? null);
}

export async function syncLinearIssues(developerId: string): Promise<void> {
  const db = getDb();
  const dev = getDeveloper(developerId);
  const conn = getConnection("linear");
  const workEmail = getWorkEmailForDeveloper(developerId);

  if (!dev || !conn?.connected || !conn.token || !workEmail) {
    db.prepare("DELETE FROM cached_linear_issues WHERE developer_id = ?").run(developerId);
    setSyncStatus(developerId, "linear_issues", "ok", null, null);
    return;
  }

  const teamIds = getSourcesForDeveloper(developerId)
    .filter((s) => s.type === "linear_team")
    .map((s) => s.identifier);

  setSyncStatus(developerId, "linear_issues", "syncing");

  try {
    if (teamIds.length === 0) {
      db.prepare("DELETE FROM cached_linear_issues WHERE developer_id = ?").run(developerId);
      setSyncStatus(developerId, "linear_issues", "ok", null, null);
      return;
    }

    const issues = await fetchLinearIssuesForAssignee(conn.token, teamIds, workEmail);

    const insert = db.prepare(
      `INSERT OR REPLACE INTO cached_linear_issues
        (developer_id, issue_id, identifier, title, state_name, state_type, team_key, team_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const tx = db.transaction(() => {
      for (const n of issues) {
        const st = n.state?.type ?? "unstarted";
        insert.run(
          developerId,
          n.id,
          n.identifier,
          n.title,
          n.state?.name ?? "",
          st,
          n.team?.key ?? null,
          n.team?.id ?? null,
          n.updatedAt,
        );
      }
    });
    tx();

    setSyncStatus(developerId, "linear_issues", "ok", null, null);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[Linear sync]", msg);
    setSyncStatus(developerId, "linear_issues", "error", msg, null);
  }
}
