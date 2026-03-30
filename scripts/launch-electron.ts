#!/usr/bin/env bun
/**
 * Electron launcher for development.
 *
 * Sets NODE_OPTIONS=--use-system-ca so Node.js trusts the OS certificate
 * store (macOS Keychain / Windows cert store).  This is required for
 * corporate proxies like Zscaler whose root CA lives in the system store.
 */
import * as path from "path";
import { spawn } from "child_process";

const env = { ...process.env };

const existing = env.NODE_OPTIONS ?? "";
if (!existing.includes("--use-system-ca")) {
  env.NODE_OPTIONS = existing ? `${existing} --use-system-ca` : "--use-system-ca";
}

const electronBin = path.join(process.cwd(), "node_modules", ".bin", "electron");

const child = spawn(electronBin, ["electron/dist/main.js"], {
  env,
  stdio: "inherit",
  cwd: process.cwd(),
});

child.on("exit", (code) => process.exit(code ?? 0));
