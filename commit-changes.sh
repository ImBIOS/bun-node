#!/bin/bash

set -e

# Extract versions from versions.json
BUN_CANARY_VERSION=$(jq -r '.bun.canary' versions.json)
BUN_LATEST_VERSION=$(jq -r '.bun.latest' versions.json)
NODE_VERSIONS=$(jq -r '.nodejs | to_entries[] | "\(.value.name): \(.value.version)"' versions.json)

# Generate the commit message
COMMIT_MESSAGE="build: update image(s) version

- bun: (canary) ${BUN_CANARY_VERSION}, (latest) ${BUN_LATEST_VERSION}
- nodejs:
${NODE_VERSIONS}
- distro: ${DISTROS}"

# Configure git
git config --local user.email "github-actions[bot]@users.noreply.github.com"
git config --local user.name "github-actions[bot]"

# Add changes and commit if there are any
git add versions.json
if ! git diff-index --quiet HEAD; then
  git commit -m "$COMMIT_MESSAGE"
fi
