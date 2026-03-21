#!/usr/bin/env bash
set -euo pipefail

TYPE="${1:-}"
if [[ "$TYPE" != "patch" && "$TYPE" != "minor" && "$TYPE" != "major" ]]; then
  echo "Usage: bun run version <patch|minor|major>"
  exit 1
fi

# Bump version in package.json only (no git tag yet)
npm version "$TYPE" --no-git-tag-version --no-commit-hooks > /dev/null

VERSION=$(node -p "require('./package.json').version")
TAG="v${VERSION}"

git add package.json bun.lock
git commit -m "chore: bump version to ${TAG}"
git tag "$TAG"
git push origin main
git push origin "$TAG"

echo "Released ${TAG}"
