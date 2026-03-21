#!/usr/bin/env bash
set -euo pipefail

# Copy static assets and public dir into the standalone output so the server
# can serve them. Next.js standalone does NOT include these by default.

STANDALONE=".next/standalone"

if [ ! -d "$STANDALONE" ]; then
  echo "Error: $STANDALONE does not exist. Run 'next build' first."
  exit 1
fi

# .next/static → .next/standalone/.next/static
rm -rf "$STANDALONE/.next/static"
cp -r .next/static "$STANDALONE/.next/static"
echo "[prepare-standalone] Copied .next/static"

# public → .next/standalone/public
if [ -d "public" ]; then
  rm -rf "$STANDALONE/public"
  cp -r public "$STANDALONE/public"
  echo "[prepare-standalone] Copied public"
fi
