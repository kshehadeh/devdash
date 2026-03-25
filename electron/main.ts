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

const isDev = process.env.NODE_ENV === "development";

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

function getAboutDetails() {
  const rootDir = path.join(__dirname, "..", "..");
  const packageJsonPath = path.join(rootDir, "package.json");
  const nodeModulesDir = path.join(rootDir, "node_modules");

  let appVersion = app.getVersion();
  let dependencies: Record<string, string> = {};

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      version?: string;
      dependencies?: Record<string, string>;
    };
    if (packageJson.version) appVersion = packageJson.version;
    dependencies = packageJson.dependencies ?? {};
  } catch {
    // Keep defaults if package metadata cannot be read.
  }

  const librariesText =
    Object.entries(dependencies)
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
      .join("\n") || "No third-party libraries listed.";

  return { appVersion, librariesText };
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
  const { appVersion, librariesText } = getAboutDetails();

  app.setAboutPanelOptions({
    applicationName: "DevDash",
    applicationVersion: appVersion,
    version: appVersion,
    iconPath: resolveThemedIconPath(),
    credits: `Open Source Libraries\n${librariesText}`,
  });
}

function showAboutDialog() {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.focus();
    return;
  }

  const { appVersion, librariesText } = getAboutDetails();
  const iconDataUrl = getThemedIconImage()?.toDataURL() ?? "";
  const detailsText = `Open Source Libraries\n${librariesText}\n\nAdditional Information:\n`;

  aboutWindow = new BrowserWindow({
    width: 680,
    height: 640,
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
      .subtitle { color: #d1d5db; font-size: 13px; margin-bottom: 4px; }
      textarea {
        width: 100%; flex: 1; box-sizing: border-box; resize: none; border-radius: 8px;
        border: 1px solid #374151; background: #030712; color: #f9fafb; padding: 12px;
        font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }
      .note { color: #9ca3af; font-size: 12px; }
      .actions { display: flex; justify-content: flex-end; }
      button {
        border: 1px solid #374151; background: #1f2937; color: #f9fafb;
        border-radius: 6px; padding: 8px 14px; cursor: pointer;
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="title">${iconDataUrl ? `<img src="${iconDataUrl}" alt="DevDash icon" />` : ""}<span>DevDash ${escapeHtml(appVersion)}</span></div>
      <div class="subtitle">Library details are editable here so you can add notes before copying.</div>
      <textarea id="details">${escapeHtml(detailsText)}</textarea>
      <div class="note">This text is not persisted yet; it is for viewing/editing/copying in this window.</div>
      <div class="actions"><button id="closeBtn">Close</button></div>
    </div>
    <script>
      const closeBtn = document.getElementById("closeBtn");
      closeBtn?.addEventListener("click", () => window.close());
    </script>
  </body>
</html>`;

  aboutWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(aboutHtml)}`);
  aboutWindow.on("closed", () => {
    aboutWindow = null;
  });
}

function syncDockIconWithTheme() {
  if (process.platform !== "darwin") return;
  const icon = getThemedIconImage();
  if (!icon) return;
  try {
    app.dock?.setIcon(icon);
  } catch {
    // non-fatal: dock icon update failed
  }
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
    { role: "viewMenu" },
    { role: "windowMenu" },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  ensureDatabaseReady();
  app.setName("DevDash");
  setupAboutPanel();

  if (!isDev) setupProtocol();

  // Keep dock/about icon aligned with macOS light/dark appearance.
  syncDockIconWithTheme();
  nativeTheme.on("updated", () => {
    setupAboutPanel();
    syncDockIconWithTheme();
  });

  registerAllHandlers(() => mainWindow);
  buildMenu();
  createWindow();
  startNotificationScheduler(() => mainWindow);
  startReminderScheduler(() => mainWindow);
  initAutoUpdate(() => mainWindow, isDev);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
