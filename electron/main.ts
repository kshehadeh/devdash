import { app, BrowserWindow, shell, protocol, net } from "electron";
import { autoUpdater } from "electron-updater";
import * as path from "path";
import * as fs from "fs";
import { registerAllHandlers } from "./ipc/index";

const isDev = process.env.NODE_ENV === "development";

// Must be called before app.whenReady() — registers the custom scheme as privileged
// so it can load ES modules, use fetch, etc.
if (!isDev) {
  protocol.registerSchemesAsPrivileged([
    { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

// Set DB path — in dev use project root, in production use userData
process.env.DEVDASH_DB_PATH = isDev
  ? path.join(process.cwd(), "devdash.db")
  : path.join(app.getPath("userData"), "devdash.db");

// Ensure DB schema is initialized (getDb runs migrations on first call)
import("./db/index").then(({ getDb }) => getDb());

let mainWindow: BrowserWindow | null = null;

function setupProtocol() {
  protocol.handle("app", (req) => {
    const url = new URL(req.url);
    let filePath = url.pathname;
    if (filePath === "/" || filePath === "") filePath = "/index.html";

    const distDir = path.join(__dirname, "..", "..", "dist");
    const fullPath = path.join(distDir, filePath);

    // SPA fallback: if file doesn't exist, serve index.html
    const servePath = fs.existsSync(fullPath) ? fullPath : path.join(distDir, "index.html");
    return net.fetch(`file://${servePath}`);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL("app://./index.html");
  }

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith("app://") && !url.startsWith("http://localhost")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("app://") && !url.startsWith("http://localhost")) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function setupAutoUpdater() {
  if (isDev) return;
  autoUpdater.checkForUpdatesAndNotify();
  autoUpdater.on("update-downloaded", () => {
    autoUpdater.quitAndInstall();
  });
}

app.whenReady().then(() => {
  if (!isDev) setupProtocol();
  registerAllHandlers();
  createWindow();
  setupAutoUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
