/**
 * electron-builder afterPack hook.
 *
 * Copies the Next.js .next/static directory into the standalone server output so
 * that static assets are served correctly from inside the packaged app.
 * The standalone server does not include .next/static by default.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("path");
const fs = require("fs");

exports.default = async function afterPack({ appOutDir, packager }) {
  const resourcesDir = path.join(appOutDir, packager.platform.nodeName === "darwin"
    ? `${packager.appInfo.productFilename}.app/Contents/Resources`
    : "resources");

  const standaloneDir = path.join(resourcesDir, "app", ".next", "standalone", ".next");
  const staticSrc = path.join(__dirname, "..", ".next", "static");
  const staticDest = path.join(standaloneDir, "static");

  if (fs.existsSync(staticSrc) && !fs.existsSync(staticDest)) {
    fs.cpSync(staticSrc, staticDest, { recursive: true });
    console.log("[afterPack] Copied .next/static into standalone bundle");
  }
};
