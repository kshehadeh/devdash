/**
 * Side-effect-only bootstrap. Must load before any module that calls getDb() transitively.
 * Sets app name, DEVDASH_DB_PATH, and ensures userData exists in production.
 *
 * Also ensures --use-system-ca is active so Node.js trusts the OS certificate
 * store (required for corporate proxies like Zscaler whose root CA lives in
 * the macOS Keychain / Windows cert store).
 */
import { app } from "electron";
import * as fs from "fs";
import * as path from "path";

// NODE_OPTIONS must be set before the Node.js TLS stack initialises, which
// happens at process start.  In development the launch script handles this,
// but in production builds Electron starts directly.  If --use-system-ca is
// missing we inject it into NODE_OPTIONS and relaunch (before any window is
// created, so the restart is invisible to the user).
const nodeOpts = process.env.NODE_OPTIONS ?? "";
if (!nodeOpts.includes("--use-system-ca")) {
  process.env.NODE_OPTIONS = nodeOpts ? `${nodeOpts} --use-system-ca` : "--use-system-ca";
  app.relaunch();
  app.exit(0);
}

app.setName("DevDash");

const isDev = process.env.NODE_ENV === "development";

if (!isDev) {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
}

process.env.DEVDASH_DB_PATH = isDev
  ? path.join(process.cwd(), "devdash.db")
  : path.join(app.getPath("userData"), "devdash.db");
