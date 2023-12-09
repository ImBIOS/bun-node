#!/bin/bash

# Exit on error
set -e

# Logging function
log() {
  echo "[$(date +'%Y-%m-%dT%H:%M:%S%z')] $@"
}

# Function to validate version format
validate_version() {
  local version=$1
  local regex="^[0-9]+\.[0-9]+\.[0-9]+(-canary\.[0-9]{8}\.[0-9]+)?$"
  if [[ ! $version =~ $regex ]]; then
    echo "Invalid version format: $version"
    exit 1
  fi
}

# Convert comma-separated strings to arrays
IFS=',' read -ra NODE_VERSIONS <<<"$NODE_VERSIONS_TO_BUILD"
IFS=',' read -ra BUN_VERSIONS <<<"$BUN_VERSIONS_TO_BUILD"
IFS=',' read -ra DISTROS <<<"$DISTROS"

# Validate versions
for version in "${NODE_VERSIONS[@]}"; do
  validate_version "$version"
done
for version in "${BUN_VERSIONS[@]}"; do
  validate_version "$version"
done

# Build, tag, and push loop
for node_version in "${NODE_VERSIONS[@]}"; do
  for bun_version in "${BUN_VERSIONS[@]}"; do
    for distro in "${DISTROS[@]}"; do
      tag_distro=$distro
      if [ "$distro" == "debian-slim" ]; then
        tag_distro="slim"
      fi

      # Building the image
      log "Building image for Node version $node_version, Bun version $bun_version, Distro $distro"
      log "$REGISTRY/bun-node:${node_version}-${bun_version}-${tag_distro}"
      # docker buildx build --platform "$PLATFORMS" -t "$REGISTRY/bun-node:${node_version}-${bun_version}-${tag_distro}" "./${node_version}/${distro}" --push

      # Tagging the node latest lts, bun latest, and distro debian as latest
      if [[ "$node_version" == "21" && "$bun_version" == "latest" && "$distro" == "debian" ]]; then
        log "Tagging the latest version"
        # docker buildx build --platform "$PLATFORMS" -t "$REGISTRY/bun-node:latest" "./${node_version}/${distro}" --push
      fi
    done
  done
done
