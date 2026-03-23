import type { BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import type { UpdateInfo } from "builder-util-runtime";
import { getConfig } from "./db/config";

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const INITIAL_CHECK_DELAY_MS = 5000;

let getMainWindow: () => BrowserWindow | null = () => null;
let lastAnnouncedVersion: string | null = null;
let downloadInProgress = false;

function formatUpdateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/latest-mac\.yml/i.test(message) && /\b404\b/.test(message)) {
    return "The latest release is still being published. Try again in a minute.";
  }

  if (/ZIP file not provided/i.test(message)) {
    return "This release is missing the mac auto-update ZIP artifact. Publish a release that includes the ZIP package and try again.";
  }

  return message || "Update check failed";
}

export function isAutoUpdateEnabled(): boolean {
  return getConfig("auto_update_enabled") !== "0";
}

function announceUpdateAvailable(info: UpdateInfo): void {
  const v = info.version;
  if (lastAnnouncedVersion === v) return;
  lastAnnouncedVersion = v;
  const w = getMainWindow();
  w?.webContents.send("update:available", { version: v });
}

async function runBackgroundCheck(): Promise<void> {
  if (!isAutoUpdateEnabled()) return;
  try {
    await autoUpdater.checkForUpdates();
  } catch {
    /* ignore background failures */
  }
}

export function initAutoUpdate(getWindow: () => BrowserWindow | null, isDev: boolean): void {
  getMainWindow = getWindow;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("update-available", (info) => {
    announceUpdateAvailable(info);
  });

  if (isDev) return;

  setTimeout(() => void runBackgroundCheck(), INITIAL_CHECK_DELAY_MS);
  setInterval(() => void runBackgroundCheck(), CHECK_INTERVAL_MS);
}

export type UpdateCheckResponse =
  | { status: "up-to-date" }
  | { status: "available"; version: string }
  | { status: "skipped"; reason: string }
  | { status: "error"; message: string };

export async function runManualUpdateCheck(isDev: boolean): Promise<UpdateCheckResponse> {
  if (isDev) {
    return { status: "skipped", reason: "development" };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    if (result === null) {
      return { status: "error", message: "Updater is not active" };
    }
    if (result.isUpdateAvailable) {
      return { status: "available", version: result.updateInfo.version };
    }
    return { status: "up-to-date" };
  } catch (e) {
    return { status: "error", message: formatUpdateError(e) };
  }
}

export type DownloadInstallResponse = { ok: true } | { ok: false; message: string };

export async function downloadAndInstall(isDev: boolean): Promise<DownloadInstallResponse> {
  if (isDev) {
    return { ok: false, message: "Updates are not applied in development builds" };
  }
  if (downloadInProgress) {
    return { ok: false, message: "A download is already in progress" };
  }
  downloadInProgress = true;
  try {
    await autoUpdater.downloadUpdate();
    downloadInProgress = false;
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  } catch (e) {
    downloadInProgress = false;
    return { ok: false, message: formatUpdateError(e) };
  }
}
