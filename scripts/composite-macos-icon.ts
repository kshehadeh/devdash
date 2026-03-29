/**
 * Builds an opaque macOS bundle icon so Finder/DMG don't apply the default gray "plate"
 * behind transparent PNGs. Matches the main window chrome (#131b2e) + white mark (sidebar).
 */
import { copyFileSync, mkdirSync } from "fs";
import path from "path";
import sharp from "sharp";

const root = path.join(import.meta.dir, "..");
const buildDir = path.join(root, "build");
const logoPath = path.join(root, "src/assets/icon-white.png");
const outPath = path.join(buildDir, "macos-app-icon.png");
const srcIcon = path.join(root, "src/assets/icon.png");
const buildIconPng = path.join(buildDir, "icon.png");

const BG = { r: 19, g: 27, b: 46, alpha: 1 };
const SIZE = 1024;
const LOGO_FRAC = 0.62;

mkdirSync(buildDir, { recursive: true });

const logoPx = Math.round(SIZE * LOGO_FRAC);
const logoBuf = await sharp(logoPath)
  .resize(logoPx, logoPx, { fit: "inside" })
  .ensureAlpha()
  .png()
  .toBuffer();

await sharp({
  create: { width: SIZE, height: SIZE, channels: 4, background: BG },
})
  .composite([{ input: logoBuf, gravity: "centre" }])
  .png()
  .toFile(outPath);

copyFileSync(srcIcon, buildIconPng);

const helpImgDir = path.join(root, "help-site", "static", "img");
const faviconPath = path.join(helpImgDir, "favicon.png");
mkdirSync(helpImgDir, { recursive: true });
await sharp(outPath).resize(128, 128).png().toFile(faviconPath);

console.log(`Wrote ${outPath}, ${buildIconPng}, ${faviconPath}`);
