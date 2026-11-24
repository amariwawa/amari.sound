#!/bin/sh
# Build the web UI for the plugin and zip it for embedding (plugin/build-ui/ui.zip).
set -e
cd "$(dirname "$0")/../.."
(cd ui && npm run build:plugin)
mkdir -p plugin/build-ui
rm -f plugin/build-ui/ui.zip
(cd ui/dist-plugin && cmake -E tar cf ../../plugin/build-ui/ui.zip --format=zip .)
echo "✓ plugin/build-ui/ui.zip"
