#!/usr/bin/env bash
set -euo pipefail

TYPE="${1:-}"
if [[ "$TYPE" != "patch" && "$TYPE" != "minor" && "$TYPE" != "major" ]]; then
  echo "Usage: bun run release <patch|minor|major>"
  exit 1
fi

# Parse current version
CURRENT=$(node -p "require('./package.json').version")
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

case "$TYPE" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
esac

VERSION="${MAJOR}.${MINOR}.${PATCH}"
TAG="v${VERSION}"

PREV_TAG="$(git describe --tags --abbrev=0 2>/dev/null || true)"

if [[ -n "$PREV_TAG" ]]; then
  COMMIT_COUNT="$(git rev-list --count "${PREV_TAG}..HEAD" 2>/dev/null || echo 0)"
  if [[ "${COMMIT_COUNT}" -eq 0 ]]; then
    echo "Error: No commits since the last release (${PREV_TAG}). Nothing to release." >&2
    exit 1
  fi
fi

echo ""
echo "Planned release: ${TAG}"
echo ""

if [[ -n "$PREV_TAG" ]]; then
  echo "Commits since ${PREV_TAG} (will be included in GitHub release notes):"
  git --no-pager log --no-merges --pretty=format:'  - %s (%h)' "${PREV_TAG}..HEAD" || true
  echo ""
else
  echo "No previous tag found; this may be the first release."
  echo ""
fi

if [[ -t 0 ]]; then
  read -r -p 'Continue releasing these changes? [y/N] ' reply
  case "${reply}" in
    [yY]|[yY][eE][sS]) ;;
    *)
      echo "Aborted."
      exit 1
      ;;
  esac
else
  echo "Non-interactive shell: continuing without confirmation."
fi

echo ""

# Write new version directly into package.json
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = '${VERSION}';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

git add package.json
git commit -m "chore: bump version to ${TAG}"
git tag "$TAG"
git push origin main
git push origin "$TAG"

echo "Released ${TAG}"
