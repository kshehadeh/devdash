import { app, BrowserWindow, shell, protocol, net, Menu, nativeImage, nativeTheme } from "electron";
import * as path from "path";
import * as fs from "fs";
import "./boot-env";
import { ensureDatabaseReady } from "./db/index";
import { registerAllHandlers } from "./ipc/index";
import { runExportSettings, runImportSettings } from "./ipc/settings-io";
import { initAutoUpdate } from "./updater-service";
import { startNotificationScheduler } from "./notifications/scheduler";
import { startReminderScheduler } from "./reminders/scheduler";
import { initTray, isTrayActive } from "./tray";
import { getConfig } from "./db/config";
import { setConsoleLogEmitter, startMainConsoleCapture } from "./console-logs";

const isDev = process.env.NODE_ENV === "development";
startMainConsoleCapture();

// Must be called before app.whenReady() — registers the custom scheme as privileged
// so it can load ES modules, use fetch, etc.
if (!isDev) {
  protocol.registerSchemesAsPrivileged([
    { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

let mainWindow: BrowserWindow | null = null;
let aboutWindow: BrowserWindow | null = null;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatInstalledDependencyLines(
  nodeModulesDir: string,
  dependencies: Record<string, string>,
): string {
  if (Object.keys(dependencies).length === 0) return "";
  return Object.entries(dependencies)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, requestedVersion]) => {
      const dependencyPackagePath = path.join(nodeModulesDir, name, "package.json");
      try {
        const dependencyPackage = JSON.parse(fs.readFileSync(dependencyPackagePath, "utf8")) as {
          version?: string;
        };
        return `${name} ${dependencyPackage.version ?? requestedVersion}`;
      } catch {
        return `${name} ${requestedVersion}`;
      }
    })
    .join("\n");
}

function getAboutDetails() {
  const rootDir = path.join(__dirname, "..", "..");
  const packageJsonPath = path.join(rootDir, "package.json");
  const nodeModulesDir = path.join(rootDir, "node_modules");

  let appVersion = app.getVersion();
  let dependencies: Record<string, string> = {};
  let devDependencies: Record<string, string> = {};
  let optionalDependencies: Record<string, string> = {};

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      version?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    if (packageJson.version) appVersion = packageJson.version;
    dependencies = packageJson.dependencies ?? {};
    devDependencies = packageJson.devDependencies ?? {};
    optionalDependencies = packageJson.optionalDependencies ?? {};
  } catch {
    // Keep defaults if package metadata cannot be read.
  }

  const runtimeLines = [
    formatInstalledDependencyLines(nodeModulesDir, dependencies),
    formatInstalledDependencyLines(nodeModulesDir, optionalDependencies),
  ]
    .filter(Boolean)
    .join("\n");

  const devLines = formatInstalledDependencyLines(nodeModulesDir, devDependencies);

  const sections: string[] = [];
  if (runtimeLines) sections.push(`Runtime & bundled dependencies\n\n${runtimeLines}`);
  if (devLines) sections.push(`Development dependencies\n\n${devLines}`);

  const librariesText = sections.join("\n\n") || "No third-party libraries listed.";
  const creditsText = runtimeLines || librariesText;

  return { appVersion, librariesText, creditsText };
}

function resolveThemedIconPath() {
  const rootDir = path.join(__dirname, "..", "..");
  const buildDir = path.join(rootDir, "build");
  const srcAssetsDir = path.join(rootDir, "src", "assets");
  const darkModeIconPath = path.join(buildDir, "icon-white.png");
  const lightModeIconPath = path.join(buildDir, "icon-black.png");
  const uiWhiteIconPath = path.join(srcAssetsDir, "icon-white.png");
  const uiBlackIconPath = path.join(srcAssetsDir, "icon.png");
  const fallbackIconPath = path.join(buildDir, "icon.png");
  const preferredIconPath = nativeTheme.shouldUseDarkColors
    ? (fs.existsSync(darkModeIconPath) ? darkModeIconPath : uiWhiteIconPath)
    : (fs.existsSync(lightModeIconPath) ? lightModeIconPath : uiBlackIconPath);

  if (fs.existsSync(preferredIconPath)) return preferredIconPath;
  if (fs.existsSync(fallbackIconPath)) return fallbackIconPath;
  return undefined;
}

function createInvertedIcon(sourcePath: string) {
  const sourceImage = nativeImage.createFromPath(sourcePath);
  if (sourceImage.isEmpty()) return undefined;

  const bitmap = sourceImage.toBitmap();
  const rgbaBitmap = Buffer.from(bitmap);

  for (let index = 0; index < rgbaBitmap.length; index += 4) {
    rgbaBitmap[index] = 255 - rgbaBitmap[index];
    rgbaBitmap[index + 1] = 255 - rgbaBitmap[index + 1];
    rgbaBitmap[index + 2] = 255 - rgbaBitmap[index + 2];
  }

  return nativeImage.createFromBitmap(rgbaBitmap, sourceImage.getSize());
}

function getThemedIconImage() {
  const rootDir = path.join(__dirname, "..", "..");
  const buildDir = path.join(rootDir, "build");
  const srcAssetsDir = path.join(rootDir, "src", "assets");
  const darkModeIconPath = path.join(buildDir, "icon-white.png");
  const lightModeIconPath = path.join(buildDir, "icon-black.png");
  const uiWhiteIconPath = path.join(srcAssetsDir, "icon-white.png");
  const uiBlackIconPath = path.join(srcAssetsDir, "icon.png");
  const fallbackIconPath = path.join(buildDir, "icon.png");
  const isDarkMode = nativeTheme.shouldUseDarkColors;

  const preferredPath = isDarkMode
    ? (fs.existsSync(darkModeIconPath) ? darkModeIconPath : uiWhiteIconPath)
    : (fs.existsSync(lightModeIconPath) ? lightModeIconPath : uiBlackIconPath);
  if (fs.existsSync(preferredPath)) {
    const image = nativeImage.createFromPath(preferredPath);
    if (!image.isEmpty()) return image;
  }

  if (fs.existsSync(fallbackIconPath)) {
    if (!isDarkMode) {
      const image = nativeImage.createFromPath(fallbackIconPath);
      if (!image.isEmpty()) return image;
    }

    const invertedImage = createInvertedIcon(fallbackIconPath);
    if (invertedImage && !invertedImage.isEmpty()) return invertedImage;

    const image = nativeImage.createFromPath(fallbackIconPath);
    if (!image.isEmpty()) return image;
  }

  return undefined;
}

function setupAboutPanel() {
  const { appVersion, creditsText } = getAboutDetails();

  app.setAboutPanelOptions({
    applicationName: "DevDash",
    applicationVersion: appVersion,
    version: appVersion,
    iconPath: resolveThemedIconPath(),
    credits: `Open source libraries\n${creditsText}`,
  });
}

function showAboutDialog() {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.focus();
    return;
  }

  const { appVersion, librariesText } = getAboutDetails();
  const iconDataUrl = getThemedIconImage()?.toDataURL() ?? "";
  const detailsText = `Open source libraries\n\n${librariesText}`;

  aboutWindow = new BrowserWindow({
    width: 800,
    height: 720,
    parent: mainWindow ?? undefined,
    modal: !!mainWindow,
    resizable: true,
    minimizable: false,
    maximizable: false,
    title: "About DevDash",
    icon: getThemedIconImage(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "about-preload.js"),
    },
  });

  const aboutHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>About DevDash</title>
    <style>
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #111827; color: #f9fafb; }
      .wrap { padding: 20px; display: flex; flex-direction: column; gap: 12px; height: 100vh; box-sizing: border-box; }
      .title { display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 600; }
      .title img { width: 28px; height: 28px; object-fit: contain; }
      .details {
        width: 100%; flex: 1; min-height: 0; box-sizing: border-box; overflow: auto;
        border-radius: 8px; border: 1px solid #374151; background: #030712; color: #f9fafb;
        padding: 14px 16px; margin: 0;
        font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        white-space: pre-wrap; word-break: break-word; user-select: text;
      }
      .actions { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-shrink: 0; }
      button {
        border: 1px solid #374151; background: #1f2937; color: #f9fafb;
        border-radius: 6px; padding: 8px 14px; cursor: pointer;
      }
      button:disabled { opacity: 0.55; cursor: not-allowed; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="title">${iconDataUrl ? `<img src="${iconDataUrl}" alt="DevDash icon" />` : ""}<span>DevDash ${escapeHtml(appVersion)}</span></div>
      <pre class="details">${escapeHtml(detailsText)}</pre>
      <div class="actions">
        <button type="button" id="checkUpdatesBtn">Check for updates</button>
        <button type="button" id="closeBtn">Close</button>
      </div>
    </div>
    <script>
      const closeBtn = document.getElementById("closeBtn");
      const checkUpdatesBtn = document.getElementById("checkUpdatesBtn");
      closeBtn?.addEventListener("click", () => window.close());
      checkUpdatesBtn?.addEventListener("click", async () => {
        const api = window.aboutShell;
        if (!api?.checkForUpdates) return;
        checkUpdatesBtn.disabled = true;
        try {
          const r = await api.checkForUpdates();
          if (r.status === "up-to-date") {
            alert("You're running the latest version of DevDash.");
          } else if (r.status === "available") {
            alert(
              "Version " +
                r.version +
                " is available.\\n\\nCheck the main DevDash window for the option to download and install.",
            );
          } else if (r.status === "skipped") {
            alert(
              r.reason === "development"
                ? "Update checks are not available in development builds."
                : r.reason,
            );
          } else {
            alert(r.message || "Update check failed.");
          }
        } finally {
          checkUpdatesBtn.disabled = false;
        }
      });
    </script>
  </body>
</html>`;

  aboutWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(aboutHtml)}`);
  aboutWindow.on("closed", () => {
    aboutWindow = null;
  });
}

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
  const isMac = process.platform === "darwin";
  const isWin = process.platform === "win32";

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: "#131b2e",
    ...(isMac
      ? {
          titleBarStyle: "hiddenInset" as const,
          // Slightly lower than Electron default — closer to native toolbar vertical inset (h-14 title row)
          trafficLightPosition: { x: 12, y: 19 },
        }
      : {}),
    ...(isWin
      ? {
          titleBarOverlay: {
            color: "#131b2e",
            symbolColor: "#c1c6d7",
            height: 56,
          },
        }
      : {}),
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
              {
                label: "About DevDash",
                click: () => showAboutDialog(),
              },
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
    {
      label: "View",
      submenu: [
        {
          label: "Command Palette…",
          accelerator: "CmdOrCtrl+K",
          click: () => mainWindow?.webContents.send("menu:open-command-palette"),
        },
        { type: "separator" },
        {
          label: "Dashboard",
          click: () => mainWindow?.webContents.send("menu:navigate", "/"),
        },
        {
          label: "My Day",
          click: () => mainWindow?.webContents.send("menu:navigate", "/my-day"),
        },
        {
          label: "Team",
          click: () => mainWindow?.webContents.send("menu:navigate", "/team"),
        },
        {
          label: "Reviews",
          click: () => mainWindow?.webContents.send("menu:navigate", "/reviews"),
        },
        {
          label: "Notifications",
          click: () => mainWindow?.webContents.send("menu:navigate", "/notifications"),
        },
        {
          label: "Reminders",
          click: () => mainWindow?.webContents.send("menu:navigate", "/reminders"),
        },
        { type: "separator" },
        {
          label: "Settings",
          submenu: [
            {
              label: "General",
              click: () => mainWindow?.webContents.send("menu:navigate", "/settings/general"),
            },
            {
              label: "Notifications",
              click: () => mainWindow?.webContents.send("menu:navigate", "/settings/notifications"),
            },
            {
              label: "Connected Systems",
              click: () => mainWindow?.webContents.send("menu:navigate", "/settings/connections"),
            },
            {
              label: "Data Sources",
              click: () => mainWindow?.webContents.send("menu:navigate", "/settings/sources"),
            },
            {
              label: "Local cache",
              click: () => mainWindow?.webContents.send("menu:navigate", "/settings/cache"),
            },
            {
              label: "Development",
              click: () => mainWindow?.webContents.send("menu:navigate", "/settings/development"),
            },
          ],
        },
        { type: "separator" },
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  ensureDatabaseReady();
  app.setName("DevDash");
  setupAboutPanel();

  setConsoleLogEmitter((entry) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send("dev:console-log", entry);
  });

  if (!isDev) setupProtocol();

  nativeTheme.on("updated", () => {
    setupAboutPanel();
  });

  registerAllHandlers(() => mainWindow);
  buildMenu();
  createWindow();
  startNotificationScheduler(() => mainWindow);
  startReminderScheduler(() => mainWindow);
  initAutoUpdate(() => mainWindow, isDev);

  const trayEnabled = getConfig("tray_enabled");
  if (trayEnabled !== "0") {
    initTray(() => mainWindow);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  // On macOS, keep the app running if the tray icon is active so the user
  // can still access the tray popover after closing the main window.
  if (process.platform === "darwin" && isTrayActive()) return;
  if (process.platform !== "darwin") app.quit();
});
