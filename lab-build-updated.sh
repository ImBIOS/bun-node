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

# Function to generate tags
generate_tags() {
  local node_version=$1
  local bun_version=$2
  local distro=$3

  local node_major=${node_version%%.*}
  local node_minor=${node_version%.*}
  local bun_major=${bun_version%%.*}
  local bun_minor=${bun_version%.*}

  # Canary version check
  local is_canary=false
  if [[ $bun_version == *"-canary"* ]]; then
    is_canary=true
    bun_version="canary"
  fi

  # Base tag
  echo "$REGISTRY/bun-node:${node_version}-${bun_version}-${distro}"

  # Additional tags
  if [ "$is_canary" = false ]; then
    echo "$REGISTRY/bun-node:${node_minor}-${bun_version}-${distro}"
    echo "$REGISTRY/bun-node:${node_major}-${bun_version}-${distro}"
    echo "$REGISTRY/bun-node:${node_version}-${bun_minor}-${distro}"
    echo "$REGISTRY/bun-node:${node_version}-${bun_major}-${distro}"
    echo "$REGISTRY/bun-node:${node_minor}-${bun_minor}-${distro}"
    echo "$REGISTRY/bun-node:${node_minor}-${bun_major}-${distro}"
    echo "$REGISTRY/bun-node:${node_major}-${bun_minor}-${distro}"
    echo "$REGISTRY/bun-node:${node_major}-${bun_major}-${distro}"
  fi

  # Special 'latest' and 'current' tags
  echo "$REGISTRY/bun-node:current-${bun_version}-${distro}"
  if [[ "$node_version" == "21" ]]; then
    echo "$REGISTRY/bun-node:${node_version}-latest-${distro}"
    echo "$REGISTRY/bun-node:21-latest-${distro}"
  fi
}

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
      image_name="$REGISTRY/bun-node:${node_version}-${bun_version}-${tag_distro}"
      # docker buildx build --platform "$PLATFORMS" -t "$image_name" "./${node_version}/${distro}" --push

      # Generate tags
      tags=($(generate_tags "$node_version" "$bun_version" "$tag_distro"))
      for tag in "${tags[@]}"; do
        log "Tagging $image_name as $tag"
        # docker tag "$image_name" "$tag"
        # docker push "$tag"
      done
    done
  done
done
