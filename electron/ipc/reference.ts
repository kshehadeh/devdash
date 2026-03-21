import { ipcMain } from "electron";
import { getDb } from "../db/index";

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
      developerName: r.developer_name, issueKey: r.issue_key, summary: r.summary,
      status: r.status, statusCategory: r.status_category,
      projectKey: r.project_key ?? "—", updatedAt: r.updated_at,
      url: site ? `https://${site}.atlassian.net/browse/${r.issue_key}` : "",
    }));
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
