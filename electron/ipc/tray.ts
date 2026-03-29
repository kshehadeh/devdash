import { ipcMain, shell } from "electron";
import { getCurrentUserDeveloper } from "../db/developers";
import { getStatsContext } from "./stats-context";
import {
  getCachedPullRequests,
  getCachedJiraTickets,
  getCachedLinearTicketsAsJiraShape,
  hasFreshCache,
} from "../db/cache";
import { getConfig, setConfig } from "../db/config";
import { initTray, destroyTray, hideTrayWindow } from "../tray";
import type { BrowserWindow } from "electron";

export interface TrayItem {
  type: "pr" | "ticket";
  id: string;
  title: string;
  subtitle: string;
  url: string;
  createdAt: string;
}

export interface TrayItemsResponse {
  items: TrayItem[];
  error?: string;
}

export function registerTrayHandlers(getWindow: () => BrowserWindow | null) {
  ipcMain.handle("tray:get-items", (): TrayItemsResponse => {
    const developer = getCurrentUserDeveloper();
    if (!developer) return { items: [], error: "No current user set." };

    const ctx = getStatsContext(developer.id, 90);
    if (!ctx) return { items: [], error: "Could not load developer context." };

    const items: TrayItem[] = [];

    if (ctx.integration.code === "github" && hasFreshCache(developer.id, "github_pull_requests")) {
      const prs = getCachedPullRequests(developer.id, 90, ctx.repoFilter);
      for (const pr of prs.filter((p) => p.status === "open")) {
        items.push({
          type: "pr",
          id: pr.id,
          title: pr.title,
          subtitle: `${pr.repo} #${pr.number}`,
          url: pr.url,
          createdAt: pr.createdAt,
        });
      }
    }

    if (ctx.integration.work === "jira" && ctx.atConn?.org && hasFreshCache(developer.id, "jira_tickets")) {
      const tickets = getCachedJiraTickets(developer.id, ctx.atConn.org, 90, ctx.projectFilter);
      for (const t of tickets) {
        items.push({
          type: "ticket",
          id: t.id,
          title: t.title,
          subtitle: `${t.key} · ${t.status}`,
          url: t.url,
          createdAt: t.updatedAt,
        });
      }
    } else if (ctx.integration.work === "linear" && hasFreshCache(developer.id, "linear_issues")) {
      const tickets = getCachedLinearTicketsAsJiraShape(
        developer.id,
        90,
        ctx.linearTeamFilter,
        ctx.linearConn?.org ?? undefined,
      );
      for (const t of tickets) {
        items.push({
          type: "ticket",
          id: t.id,
          title: t.title,
          subtitle: `${t.key} · ${t.status}`,
          url: t.url,
          createdAt: t.updatedAt,
        });
      }
    }

    items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return { items };
  });

  ipcMain.handle("tray:open-external", (_e, data: { url: string }) => {
    const url = typeof data?.url === "string" ? data.url : "";
    if (url.startsWith("https://") || url.startsWith("http://")) {
      shell.openExternal(url).catch(() => {});
    }
  });

  ipcMain.handle("tray:focus-main", () => {
    hideTrayWindow();
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

  ipcMain.handle("tray:open-settings", () => {
    hideTrayWindow();
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
      win.webContents.send("menu:navigate", "/settings");
    }
  });

  ipcMain.handle("tray:toggle", (_e, data: { enabled: boolean }) => {
    const enabled = Boolean(data?.enabled);
    setConfig("tray_enabled", enabled ? "1" : "0");
    if (enabled) {
      initTray(getWindow);
    } else {
      destroyTray();
    }
    return { success: true };
  });

  ipcMain.handle("tray:get-enabled", () => {
    const v = getConfig("tray_enabled");
    return v !== "0";
  });
}
