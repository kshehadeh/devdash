import { app, BrowserWindow } from "electron";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as http from "http";

// Set DB path before anything else so Next.js picks it up
process.env.DEVDASH_DB_PATH = path.join(app.getPath("userData"), "devdash.db");

const NEXT_PORT = 3000;
const NEXT_URL = `http://localhost:${NEXT_PORT}`;
const isDev = process.env.NODE_ENV === "development";

let mainWindow: BrowserWindow | null = null;
let nextProcess: ChildProcess | null = null;

function waitForNextServer(url: string, retries = 30, delay = 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    const attempt = (remaining: number) => {
      http
        .get(url, (res) => {
          if (res.statusCode === 200 || res.statusCode === 404) {
            resolve();
          } else {
            retry(remaining);
          }
        })
        .on("error", () => retry(remaining));
    };

    const retry = (remaining: number) => {
      if (remaining <= 0) {
        reject(new Error(`Next.js server did not start at ${url}`));
        return;
      }
      setTimeout(() => attempt(remaining - 1), delay);
    };

    attempt(retries);
  });
}

function startNextServer(): Promise<void> {
  if (isDev) {
    // In dev mode, Next.js is already running (started by concurrently). Just wait for it.
    return waitForNextServer(NEXT_URL);
  }

  return new Promise((resolve, reject) => {
    nextProcess = spawn("bun", ["run", "start", "--port", String(NEXT_PORT)], {
      cwd: path.join(__dirname, ".."),
      env: { ...process.env, NODE_ENV: "production" },
      stdio: "inherit",
    });

    nextProcess.on("error", reject);

    waitForNextServer(NEXT_URL).then(resolve).catch(reject);
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

  mainWindow.loadURL(NEXT_URL);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    await startNextServer();
    createWindow();
  } catch (err) {
    console.error("Failed to start Next.js server:", err);
    app.quit();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
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
