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
  echo ""
  echo "Commits since ${PREV_TAG} (will be included in GitHub release notes):"
  git log --no-merges --pretty=format:'  - %s (%h)' "${PREV_TAG}..HEAD" || true
  echo ""
fi

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
