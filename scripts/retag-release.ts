#!/usr/bin/env bun
import { execSync, spawnSync } from "child_process";
import { search, confirm } from "@inquirer/prompts";

interface Release {
  tagName: string;
  name: string;
  createdAt: string;
  isDraft: boolean;
}

interface Candidate {
  tag: string;
  label: string;
  hasDraftRelease: boolean;
}

function gh(args: string[]): string {
  const result = spawnSync("gh", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || `gh command failed: gh ${args.join(" ")}`);
  }
  return result.stdout.trim();
}

function ghTry(args: string[]): string | null {
  const result = spawnSync("gh", args, { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function listDraftReleases(): Release[] {
  const json = gh(["release", "list", "--json", "tagName,name,createdAt,isDraft", "--limit", "20"]);
  const releases: Release[] = JSON.parse(json);
  return releases.filter((r) => r.isDraft);
}

function listRemoteVersionTags(): string[] {
  const result = spawnSync("git", ["tag", "-l", "v*", "--sort=-version:refname"], { encoding: "utf8" });
  if (result.status !== 0) return [];
  return result.stdout.trim().split("\n").filter(Boolean).slice(0, 20);
}

function hasRelease(tagName: string): boolean {
  return ghTry(["release", "view", tagName]) !== null;
}

function getTagCommit(tagName: string): string {
  const result = spawnSync("git", ["rev-list", "-n", "1", tagName], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Could not resolve tag ${tagName}: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function buildCandidates(drafts: Release[], allTags: string[]): Candidate[] {
  const draftTagNames = new Set(drafts.map((r) => r.tagName));
  const candidates: Candidate[] = [];

  // Draft releases first
  for (const r of drafts) {
    candidates.push({
      tag: r.tagName,
      label: `${r.name || r.tagName} (${r.tagName}) [draft release] — created ${new Date(r.createdAt).toLocaleDateString()}`,
      hasDraftRelease: true,
    });
  }

  // Tags with no release at all
  for (const tag of allTags) {
    if (draftTagNames.has(tag)) continue;
    if (!hasRelease(tag)) {
      candidates.push({
        tag,
        label: `${tag} [no release]`,
        hasDraftRelease: false,
      });
    }
  }

  return candidates;
}

async function main() {
  let drafts: Release[];
  try {
    drafts = listDraftReleases();
  } catch (err) {
    console.error("Failed to fetch releases:", (err as Error).message);
    process.exit(1);
  }

  const allTags = listRemoteVersionTags();
  const candidates = buildCandidates(drafts, allTags);

  if (candidates.length === 0) {
    console.log("No broken releases or unmatched tags found.");
    process.exit(0);
  }

  const selected = await search<Candidate>({
    message: "Select a tag to retag and rerun:",
    source: (term) => {
      const q = (term ?? "").toLowerCase();
      return candidates
        .filter((c) => c.label.toLowerCase().includes(q))
        .map((c) => ({ name: c.label, value: c }));
    },
  });

  const tag = selected.tag;

  let commit: string;
  try {
    commit = getTagCommit(tag);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  console.log(`\nTag ${tag} points to commit ${commit}`);

  const confirmMsg = selected.hasDraftRelease
    ? `Delete draft release + tag "${tag}", then re-push to retrigger the release workflow?`
    : `Delete remote tag "${tag}" and re-push to retrigger the release workflow?`;

  const confirmed = await confirm({ message: confirmMsg, default: false });

  if (!confirmed) {
    console.log("Aborted.");
    process.exit(0);
  }

  if (selected.hasDraftRelease) {
    console.log(`\nDeleting GitHub draft release for ${tag}...`);
    gh(["release", "delete", tag, "--yes"]);
  }

  console.log(`Deleting remote tag ${tag}...`);
  execSync(`git push origin :refs/tags/${tag}`, { stdio: "inherit" });

  console.log(`Recreating local tag ${tag} on ${commit}...`);
  spawnSync("git", ["tag", "-d", tag], { stdio: "inherit" });
  execSync(`git tag ${tag} ${commit}`, { stdio: "inherit" });

  console.log(`Pushing tag ${tag} to trigger release workflow...`);
  execSync(`git push origin ${tag}`, { stdio: "inherit" });

  console.log(`\nDone. The release workflow has been retriggered for ${tag}.`);
  console.log(`Monitor progress at: https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/actions`);
}

main();
