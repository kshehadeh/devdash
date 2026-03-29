import { Tray, BrowserWindow, nativeImage, nativeTheme } from "electron";
import * as path from "path";
import * as fs from "fs";

let tray: Tray | null = null;
let trayWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === "development";

function getTrayIconImage(): Electron.NativeImage | undefined {
  const rootDir = path.join(__dirname, "..", "..");
  const buildDir = path.join(rootDir, "build");
  const srcAssetsDir = path.join(rootDir, "src", "assets");

  const darkIconPath = path.join(buildDir, "icon-white.png");
  const lightIconPath = path.join(buildDir, "icon-black.png");
  const uiWhiteIconPath = path.join(srcAssetsDir, "icon-white.png");
  const uiBlackIconPath = path.join(srcAssetsDir, "icon.png");
  const fallbackIconPath = path.join(buildDir, "icon.png");

  const isDarkMode = nativeTheme.shouldUseDarkColors;
  const preferredPath = isDarkMode
    ? (fs.existsSync(darkIconPath) ? darkIconPath : uiWhiteIconPath)
    : (fs.existsSync(lightIconPath) ? lightIconPath : uiBlackIconPath);

  let image: Electron.NativeImage | undefined;

  if (fs.existsSync(preferredPath)) {
    const img = nativeImage.createFromPath(preferredPath);
    if (!img.isEmpty()) image = img;
  }

  if (!image && fs.existsSync(fallbackIconPath)) {
    const img = nativeImage.createFromPath(fallbackIconPath);
    if (!img.isEmpty()) image = img;
  }

  if (!image) return undefined;

  const resized = image.resize({ width: 16, height: 16 });
  resized.setTemplateImage(true);
  return resized;
}

function positionAndShow(win: BrowserWindow) {
  if (!tray) return;
  const trayBounds = tray.getBounds();
  const winBounds = win.getBounds();
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2);
  const y = trayBounds.y + trayBounds.height + 4;
  win.setPosition(x, y, false);
  win.show();
  win.focus();
}

function createTrayWindow() {
  if (trayWindow && !trayWindow.isDestroyed()) return;

  trayWindow = new BrowserWindow({
    width: 360,
    height: 500,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, "tray-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    trayWindow.loadURL("http://localhost:5173/#/tray").catch(() => {});
  } else {
    trayWindow.loadURL("app://./index.html#/tray").catch(() => {});
  }

  trayWindow.on("blur", () => {
    trayWindow?.hide();
  });

  trayWindow.on("closed", () => {
    trayWindow = null;
  });
}

export function initTray(_getMainWindow?: () => BrowserWindow | null) {
  if (tray && !tray.isDestroyed()) return;

  const icon = getTrayIconImage();
  if (!icon) return;

  tray = new Tray(icon);
  tray.setToolTip("DevDash");

  tray.on("click", () => {
    if (!trayWindow || trayWindow.isDestroyed()) {
      createTrayWindow();
    }
    if (!trayWindow) return;

    if (trayWindow.isVisible()) {
      trayWindow.hide();
    } else {
      positionAndShow(trayWindow);
    }
  });

  nativeTheme.on("updated", updateTrayIcon);
}

function updateTrayIcon() {
  if (!tray || tray.isDestroyed()) return;
  const icon = getTrayIconImage();
  if (icon) tray.setImage(icon);
}

export function destroyTray() {
  if (trayWindow && !trayWindow.isDestroyed()) {
    trayWindow.destroy();
  }
  trayWindow = null;

  if (tray && !tray.isDestroyed()) {
    tray.destroy();
  }
  tray = null;

  nativeTheme.removeListener("updated", updateTrayIcon);
}

export function isTrayActive(): boolean {
  return tray !== null && !tray.isDestroyed();
}

export function hideTrayWindow() {
  if (trayWindow && !trayWindow.isDestroyed()) {
    trayWindow.hide();
  }
}
