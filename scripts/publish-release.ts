#!/usr/bin/env bun
import { execSync, spawnSync } from "child_process";
import { search, confirm } from "@inquirer/prompts";

interface Release {
  tagName: string;
  name: string;
  createdAt: string;
  isDraft: boolean;
}

interface ReleaseAsset {
  name: string;
}

const PUBLISH_READINESS_TIMEOUT_MS = 10 * 60 * 1000;
const PUBLISH_READINESS_POLL_MS = 5000;
const REQUIRED_RELEASE_ASSETS = ["latest-mac.yml", ".dmg", ".zip"] as const;

function gh(args: string[]): string {
  const result = spawnSync("gh", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || `gh command failed: gh ${args.join(" ")}`);
  }
  return result.stdout.trim();
}

function listDraftReleases(): Release[] {
  const json = gh(["release", "list", "--json", "tagName,name,createdAt,isDraft", "--limit", "20"]);
  const releases: Release[] = JSON.parse(json);
  return releases.filter((r) => r.isDraft);
}

function getReleaseAssets(tagName: string): ReleaseAsset[] {
  const json = gh(["release", "view", tagName, "--json", "assets"]);
  const release = JSON.parse(json) as { assets: ReleaseAsset[] };
  return release.assets ?? [];
}

function findMissingRequiredAssets(assets: ReleaseAsset[]): string[] {
  const names = assets.map((asset) => asset.name);
  return REQUIRED_RELEASE_ASSETS.filter((required) => {
    if (required.startsWith(".")) {
      return !names.some((name) => name.endsWith(required));
    }
    return !names.includes(required);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForReleaseAssets(tagName: string): Promise<void> {
  const startedAt = Date.now();

  while (true) {
    const assets = getReleaseAssets(tagName);
    const missing = findMissingRequiredAssets(assets);

    if (missing.length === 0) {
      return;
    }

    if (Date.now() - startedAt >= PUBLISH_READINESS_TIMEOUT_MS) {
      throw new Error(
        `Release assets are still incomplete for ${tagName}. Missing: ${missing.join(", ")}. ` +
          "Wait for the release workflow to finish, then run publish again.",
      );
    }

    console.log(`Waiting for release assets for ${tagName}: missing ${missing.join(", ")}...`);
    await sleep(PUBLISH_READINESS_POLL_MS);
  }
}

async function main() {
  let drafts: Release[];
  try {
    drafts = listDraftReleases();
  } catch (err) {
    console.error("Failed to fetch releases:", (err as Error).message);
    process.exit(1);
  }

  if (drafts.length === 0) {
    console.log("No draft releases found.");
    process.exit(0);
  }

  const selected = await search<Release>({
    message: "Select a draft release to publish:",
    source: (term) => {
      const q = (term ?? "").toLowerCase();
      return drafts
        .filter((r) =>
          `${r.name} ${r.tagName}`.toLowerCase().includes(q)
        )
        .map((r) => ({
          name: `${r.name || r.tagName} (${r.tagName}) — created ${new Date(r.createdAt).toLocaleDateString()}`,
          value: r,
        }));
    },
  });

  const confirmed = await confirm({
    message: `Publish ${selected.tagName}?`,
    default: false,
  });

  if (!confirmed) {
    console.log("Aborted.");
    process.exit(0);
  }

  console.log(`\nPublishing ${selected.tagName}...`);

  try {
    await waitForReleaseAssets(selected.tagName);
    execSync(`gh release edit ${selected.tagName} --draft=false`, {
      stdio: "inherit",
    });
    console.log(`Release ${selected.tagName} is now published.`);
  } catch (err) {
    console.error("Failed to publish release:", (err as Error).message);
    process.exit(1);
  }
}

main();
