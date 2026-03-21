import { app, BrowserWindow, shell } from "electron";
import { autoUpdater } from "electron-updater";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as http from "http";
import * as net from "net";

const isDev = process.env.NODE_ENV === "development";

// Set DB path before anything else so Next.js picks it up
process.env.DEVDASH_DB_PATH = path.join(app.getPath("userData"), "devdash.db");

let mainWindow: BrowserWindow | null = null;
let nextProcess: ChildProcess | null = null;
let nextPort = 3000;

function findFreePort(start: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => {
      // Port in use — try next
      findFreePort(start + 1).then(resolve).catch(reject);
    });
    server.listen(start, "127.0.0.1", () => {
      server.close(() => resolve(start));
    });
  });
}

function waitForServer(url: string, retries = 30, delay = 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    const attempt = (remaining: number) => {
      http
        .get(url, (res) => {
          if (res.statusCode && res.statusCode < 500) {
            resolve();
          } else {
            retry(remaining);
          }
        })
        .on("error", () => retry(remaining));
    };
    const retry = (remaining: number) => {
      if (remaining <= 0) {
        reject(new Error(`Server did not start at ${url}`));
        return;
      }
      setTimeout(() => attempt(remaining - 1), delay);
    };
    attempt(retries);
  });
}

function startNextServer(): Promise<void> {
  const nextUrl = `http://localhost:${nextPort}`;

  if (isDev) {
    return waitForServer(nextUrl);
  }

  return new Promise((resolve, reject) => {
    // In production the app ships the Next.js standalone server.
    // The standalone output lives at .next/standalone/server.js relative to app root.
    const appRoot = path.join(__dirname, "..");
    const serverScript = path.join(appRoot, ".next", "standalone", "server.js");

    nextProcess = spawn(process.execPath, [serverScript], {
      cwd: path.join(appRoot, ".next", "standalone"),
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: String(nextPort),
        HOSTNAME: "127.0.0.1",
        DEVDASH_DB_PATH: process.env.DEVDASH_DB_PATH,
      },
      stdio: "inherit",
    });

    nextProcess.on("error", reject);

    waitForServer(nextUrl).then(resolve).catch(reject);
  });
}

function createWindow(port: number) {
  const nextUrl = `http://localhost:${port}`;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(nextUrl);

  // Open all external links in the system default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(nextUrl)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(nextUrl)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

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

app.whenReady().then(async () => {
  try {
    nextPort = await findFreePort(3000);
    await startNextServer();
    createWindow(nextPort);
    setupAutoUpdater();
  } catch (err) {
    console.error("Failed to start Next.js server:", err);
    app.quit();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(nextPort);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (nextProcess) {
    nextProcess.kill();
    nextProcess = null;
  }
});
