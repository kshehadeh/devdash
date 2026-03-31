import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import * as path from "path";
import { createSeededTestDb } from "./fixtures/seed-db";

let app: ElectronApplication;
let page: Page;
const testDbPath = path.join(__dirname, "test-e2e.db");

test.beforeAll(async () => {
  createSeededTestDb(testDbPath);

  app = await electron.launch({
    args: [path.join(__dirname, "../electron/dist/main.js")],
    env: {
      ...process.env,
      DEVDASH_DB_PATH: testDbPath,
      DEVDASH_DISABLE_SYNC: "1",
      NODE_ENV: "test",
    },
  });

  page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
});

test.afterAll(async () => {
  if (app) await app.close();

  const fs = await import("fs");
  for (const suffix of ["", "-wal", "-shm"]) {
    const p = suffix ? `${testDbPath}${suffix}` : testDbPath;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
});

test("app window opens", async () => {
  expect(page).toBeTruthy();
  const title = await page.title();
  expect(title).toBeTruthy();
});

test("main window is visible", async () => {
  const isVisible = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return win?.isVisible();
  });
  expect(isVisible).toBe(true);
});

test("dashboard renders without errors", async () => {
  // Give the React app time to mount and render
  await page.waitForTimeout(2000);

  // No error boundary should be visible
  const errorBoundary = await page.$('[data-testid="error-boundary"]');
  expect(errorBoundary).toBeNull();

  // The page should have meaningful content
  const bodyText = await page.textContent("body");
  expect(bodyText?.length).toBeGreaterThan(0);
});
