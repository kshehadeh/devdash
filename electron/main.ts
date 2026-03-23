import { app, BrowserWindow, shell, protocol, net, Menu } from "electron";
import * as path from "path";
import * as fs from "fs";
import "./boot-env";
import { ensureDatabaseReady } from "./db/index";
import { registerAllHandlers } from "./ipc/index";
import { runExportSettings, runImportSettings } from "./ipc/settings-io";
import { initAutoUpdate } from "./updater-service";

const isDev = process.env.NODE_ENV === "development";

// Must be called before app.whenReady() — registers the custom scheme as privileged
// so it can load ES modules, use fetch, etc.
if (!isDev) {
  protocol.registerSchemesAsPrivileged([
    { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

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

function buildMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === "darwin"
      ? [
          {
            label: "DevDash",
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "Settings...",
          click: () => mainWindow?.webContents.send("menu:navigate", "/settings"),
        },
        { type: "separator" },
        {
          label: "Export Settings...",
          click: () => runExportSettings(mainWindow),
        },
        {
          label: "Import Settings...",
          click: () => runImportSettings(mainWindow),
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  ensureDatabaseReady();

  if (!isDev) setupProtocol();

  // Set dock icon explicitly for dev mode (production uses build/icon.icns via electron-builder)
  if (process.platform === "darwin") {
    const iconPath = path.join(__dirname, "..", "..", "build", "icon.png");
    if (fs.existsSync(iconPath)) {
      try {
        app.dock?.setIcon(iconPath);
      } catch {
        // non-fatal: dock icon update failed
      }
    }
  }

  registerAllHandlers(() => mainWindow);
  buildMenu();
  createWindow();
  initAutoUpdate(() => mainWindow, isDev);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
