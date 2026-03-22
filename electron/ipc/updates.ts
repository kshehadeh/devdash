import { ipcMain } from "electron";
import { downloadAndInstall, runManualUpdateCheck } from "../updater-service";

const isDev = process.env.NODE_ENV === "development";

export function registerUpdateHandlers() {
  ipcMain.handle("updates:check", async () => runManualUpdateCheck(isDev));

  ipcMain.handle("updates:download-and-install", async () => downloadAndInstall(isDev));
}
