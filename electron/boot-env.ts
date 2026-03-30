/**
 * Side-effect-only bootstrap. Must load before any module that calls getDb() transitively.
 * Sets app name, DEVDASH_DB_PATH, and ensures userData exists in production.
 */
import { app } from "electron";
import * as fs from "fs";
import * as path from "path";

app.setName("DevDash");

const isDev = process.env.NODE_ENV === "development";

if (!isDev) {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
}

process.env.DEVDASH_DB_PATH = isDev
  ? path.join(process.cwd(), "devdash.db")
  : path.join(app.getPath("userData"), "devdash.db");
