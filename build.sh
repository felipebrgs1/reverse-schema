#!/bin/bash
# Usage: ./build.sh chrome  ou  ./build.sh firefox
set -e

BROWSER="${1:-chrome}"
DIST="dist/$BROWSER"

rm -rf "$DIST"
mkdir -p "$DIST"

# Copy all extension files except build artifacts
for f in interceptor.js bridge.js background.js schema.js popup.js popup.html icons; do
  cp -r "$f" "$DIST/"
done

if [ "$BROWSER" = "firefox" ]; then
  cp manifest.firefox.json "$DIST/manifest.json"
  echo "Built for Firefox → $DIST/"
else
  cp manifest.json "$DIST/manifest.json"
  echo "Built for Chrome → $DIST/"
fi
