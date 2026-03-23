import { ipcMain } from "electron";
import { getDb } from "../db/index";
import { getIntegrationSettings } from "../db/integration-settings";
import { getConnection } from "../db/connections";
import { getAtlassianContextForValidation } from "../sync/atlassian-sync";

export function registerReferenceHandlers() {
  ipcMain.handle("reference:pull-requests", () => {
    const db = getDb();
    const rows = db.prepare(`
      SELECT cpr.developer_id, d.name AS developer_name, cpr.repo, cpr.pr_number,
             cpr.title, cpr.status, cpr.review_count, cpr.created_at, cpr.updated_at, cpr.merged_at
      FROM cached_pull_requests cpr
      INNER JOIN developers d ON d.id = cpr.developer_id
      ORDER BY cpr.updated_at DESC
    `).all() as any[];

    return rows.map((r) => ({
      developerName: r.developer_name, repo: r.repo, number: r.pr_number,
      title: r.title, url: `https://github.com/${r.repo}/pull/${r.pr_number}`,
      status: r.status, reviewCount: r.review_count,
      createdAt: r.created_at, updatedAt: r.updated_at, mergedAt: r.merged_at,
    }));
  });

  ipcMain.handle("reference:tickets", () => {
    const db = getDb();
    const work = getIntegrationSettings().work;

    if (work === "linear") {
      const conn = getConnection("linear");
      const workspace = conn?.org?.trim() ?? "";
      const rows = db.prepare(`
        SELECT cli.developer_id, d.name AS developer_name, cli.identifier, cli.title,
               cli.state_name, cli.state_type, cli.team_key, cli.updated_at
        FROM cached_linear_issues cli
        INNER JOIN developers d ON d.id = cli.developer_id
        ORDER BY cli.updated_at DESC
      `).all() as any[];

      const cat = (st: string) => {
        const x = (st || "").toLowerCase();
        if (x === "completed" || x === "canceled") return "done";
        if (x === "started") return "in_progress";
        return "todo";
      };
      return rows.map((r) => ({
        developerName: r.developer_name,
        developerId: r.developer_id,
        issueKey: r.identifier,
        summary: r.title,
        status: r.state_name,
        statusCategory: cat(r.state_type),
        projectKey: r.team_key ?? "—",
        updatedAt: r.updated_at,
        url: workspace ? `https://linear.app/${workspace}/issue/${r.identifier}` : `https://linear.app/issue/${r.identifier}`,
        source: "linear" as const,
      }));
    }

    const conn = db.prepare("SELECT org FROM connections WHERE id = 'atlassian'").get() as { org: string } | undefined;
    const site = conn?.org ?? "";

    const rows = db.prepare(`
      SELECT cjt.developer_id, d.name AS developer_name, cjt.issue_key, cjt.summary,
             cjt.status, cjt.status_category, cjt.project_key, cjt.updated_at
      FROM cached_jira_tickets cjt
      INNER JOIN developers d ON d.id = cjt.developer_id
      ORDER BY cjt.updated_at DESC
    `).all() as any[];

    return rows.map((r) => ({
      developerName: r.developer_name,
      developerId: r.developer_id,
      issueKey: r.issue_key,
      summary: r.summary,
      status: r.status,
      statusCategory: r.status_category,
      projectKey: r.project_key ?? "—",
      updatedAt: r.updated_at,
      url: site ? `https://${site}.atlassian.net/browse/${r.issue_key}` : "",
      source: "jira" as const,
    }));
  });

  ipcMain.handle("jira:ticket:validate", async (_e, { issueKey, developerId }: { issueKey: string; developerId: string }) => {
    const db = getDb();
    const ctx = getAtlassianContextForValidation(developerId);
    if (!ctx) return { exists: true }; // no credentials — assume still valid

    try {
      const res = await fetch(
        `https://${ctx.site}.atlassian.net/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=id`,
        {
          headers: {
            Authorization: "Basic " + Buffer.from(`${ctx.email}:${ctx.token}`).toString("base64"),
            Accept: "application/json",
          },
        },
      );

      if (res.status === 404) {
        db.prepare("DELETE FROM cached_jira_tickets WHERE developer_id = ? AND issue_key = ?")
          .run(developerId, issueKey);
        console.log(`[ValidateJira] Removed deleted ticket ${issueKey} for developer ${developerId}`);
        return { exists: false };
      }

      return { exists: res.ok };
    } catch {
      return { exists: true }; // network error — assume still valid
    }
  });

  ipcMain.handle("reference:documents", () => {
    const db = getDb();
    const rows = db.prepare(`
      SELECT ccp.developer_id, d.name AS developer_name, ccp.page_id, ccp.title,
             ccp.space_key, ccp.version_count, ccp.view_count, ccp.last_modified
      FROM cached_confluence_pages ccp
      INNER JOIN developers d ON d.id = ccp.developer_id
      ORDER BY ccp.last_modified DESC
    `).all() as any[];

    return rows.map((r) => ({
      developerName: r.developer_name, pageId: r.page_id, title: r.title,
      spaceKey: r.space_key ?? "—", versionCount: r.version_count,
      viewCount: r.view_count, lastModified: r.last_modified,
    }));
  });
}
