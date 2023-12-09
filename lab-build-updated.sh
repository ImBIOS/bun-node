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

# Read the JSON file
json_data=$(cat versions.json)

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
  if [ $is_canary == false ]; then
    echo "$REGISTRY/bun-node:${node_minor}-${bun_version}-${distro}"
    echo "$REGISTRY/bun-node:${node_major}-${bun_version}-${distro}"
    echo "$REGISTRY/bun-node:${node_version}-${bun_minor}-${distro}"
    echo "$REGISTRY/bun-node:${node_version}-${bun_major}-${distro}"
    echo "$REGISTRY/bun-node:${node_minor}-${bun_minor}-${distro}"
    echo "$REGISTRY/bun-node:${node_minor}-${bun_major}-${distro}"
    echo "$REGISTRY/bun-node:${node_major}-${bun_minor}-${distro}"
    echo "$REGISTRY/bun-node:${node_major}-${bun_major}-${distro}"
  elif [[ $bun_version == "canary" ]]; then
    echo "$REGISTRY/bun-node:${node_minor}-canary-${distro}"
    echo "$REGISTRY/bun-node:${node_major}-canary-${distro}"
  fi

  # TODO Get these tagging codename from versions.json
  # Special 'current' tags
  if [[ "$node_major" == "21" ]]; then
    # Extract the codename for the current version
    local codename=$(echo "${json_data}" | jq -r '.nodejs."21".name')
    echo "$REGISTRY/bun-node:${codename}-${bun_version}-${distro}"
    if [[ $is_canary == false ]]; then
      echo "$REGISTRY/bun-node:${node_version}-latest-${distro}"
      echo "$REGISTRY/bun-node:21-latest-${distro}"
      echo "$REGISTRY/bun-node:${codename}-latest-${distro}"
    fi
  fi

  # Special nodejs codename tags
  # Extract the codename for the current version
  local codename=$(echo "${json_data}" | jq -r ".nodejs.\"${node_major}\".name")
  echo "$REGISTRY/bun-node:${codename}-${bun_version}-${distro}"
  if [[ $is_canary == false ]]; then
    echo "$REGISTRY/bun-node:${node_version}-latest-${distro}"
    echo "$REGISTRY/bun-node:${node_major}-latest-${distro}"
    echo "$REGISTRY/bun-node:${codename}-latest-${distro}"
  fi

  # Special 'latest' tag
  local is_latest_lts=false
  if [[ "$node_major" == "20" ]]; then
    is_latest_lts=true
  fi
  if [[ $is_canary == false && $is_latest_lts && $distro == "debian" ]]; then
    echo "$REGISTRY/bun-node:latest"
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
