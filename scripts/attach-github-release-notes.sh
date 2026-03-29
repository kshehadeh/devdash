#!/usr/bin/env bash
# Fill a GitHub release body with commits since the last *published* (non-draft) release,
# using the Compare API. No PR / generate-notes API.
# After updating notes, clears draft status so the release is published (electron-builder
# typically leaves GitHub releases as drafts until this step).
#
# Usage:
#   ./scripts/attach-github-release-notes.sh [TAG]
#   GITHUB_REF_NAME=v1.2.3 ./scripts/attach-github-release-notes.sh
#
# Environment:
#   GH_TOKEN / GITHUB_TOKEN — token for gh (repo scope for releases)
#   GITHUB_REPOSITORY       — owner/repo (optional if `gh repo view` works in cwd)
#   GITHUB_REF_NAME         — tag to edit (optional if TAG is passed as $1)
#   RELEASE_NOTES_PATH      — where to write markdown before gh release edit (default: release-notes.md)
#
set -euo pipefail

TAG="${1:-${GITHUB_REF_NAME:-}}"
REPO="${GITHUB_REPOSITORY:-}"
NOTES_FILE="${RELEASE_NOTES_PATH:-release-notes.md}"

if [[ -z "$TAG" ]]; then
  echo "Usage: $0 <tag>   (example: v0.8.0)" >&2
  echo "Or set GITHUB_REF_NAME when running in CI." >&2
  exit 1
fi

if [[ -z "$REPO" ]]; then
  if ! REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)"; then
    echo "Set GITHUB_REPOSITORY=owner/repo or run from a cloned repo with \`gh auth\`." >&2
    exit 1
  fi
fi

# Non-merge commits between two tags (chronological order).
commits_between_tags() {
  local repo="$1" base="$2" head="$3"
  gh api "repos/${repo}/compare/${base}...${head}" \
    | jq -r '.commits[]
      | select(.parents | length == 1)
      | "- \(.commit.message | split("\n")[0]) (\(.sha[0:7]))"'
}

# No earlier published release: list linear commits reachable from tag (newest-first API → reverse).
# Capped at 100; first-release repos rarely exceed that in practice.
commits_from_tag_root() {
  local repo="$1" ref="$2"
  gh api "repos/${repo}/commits?sha=${ref}&per_page=100" \
    | jq -r '. | reverse | .[]
      | select(.parents | length == 1)
      | "- \(.commit.message | split("\n")[0]) (\(.sha[0:7]))"'
}

PREV_TAG="$(gh api "repos/${REPO}/releases?per_page=100" \
  | jq -r --arg cur "${TAG}" \
  '[.[] | select(.draft == false and .tag_name != $cur)] | first | .tag_name // empty')"

if [[ -n "${PREV_TAG}" ]]; then
  echo "Commits since last published release tag: ${PREV_TAG} → ${TAG}"
  COMMITS="$(commits_between_tags "${REPO}" "${PREV_TAG}" "${TAG}" || true)"
  LINK="**Full Changelog**: https://github.com/${REPO}/compare/${PREV_TAG}...${TAG}"
else
  echo "No earlier published release; listing commits from tag (up to 100)."
  COMMITS="$(commits_from_tag_root "${REPO}" "${TAG}" || true)"
  LINK=""
fi

BODY="## Commits

${COMMITS:-_No commits found in this range._}"

if [[ -n "${LINK}" ]]; then
  BODY="${BODY}

${LINK}"
fi

printf '%s\n' "${BODY}" > "${NOTES_FILE}"

gh release edit "${TAG}" --notes-file "${NOTES_FILE}" --draft=false
echo "Updated and published release ${TAG} (wrote ${NOTES_FILE})."
