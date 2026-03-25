import { ipcMain, shell } from "electron";
import type { BrowserWindow } from "electron";
import * as path from "path";

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
}
