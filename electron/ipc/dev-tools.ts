import { ipcMain, shell } from "electron";
import type { BrowserWindow } from "electron";
import * as path from "path";
import { appendRendererConsoleLog, clearConsoleLogs, getConsoleLogs } from "../console-logs";

function getDbPath(): string {
  return process.env.DEVDASH_DB_PATH ?? path.join(process.cwd(), "devdash.db");
}

export function registerDevToolsHandlers(getWindow: () => BrowserWindow | null) {
  ipcMain.handle("dev:get-db-path", () => {
    return getDbPath();
  });

  ipcMain.handle("dev:reveal-db", () => {
    shell.showItemInFolder(getDbPath());
    return { success: true };
  });

  ipcMain.handle("dev:toggle-devtools", () => {
    const win = getWindow();
    if (!win) return { success: false };
    win.webContents.toggleDevTools();
    return { success: true };
  });

  ipcMain.handle("dev:get-console-logs", () => getConsoleLogs());

  ipcMain.handle("dev:clear-console-logs", () => {
    clearConsoleLogs();
    return { success: true };
  });

  ipcMain.on("dev:append-console-log", (_event, payload) => {
    appendRendererConsoleLog(payload);
  });
}
