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

# If NODE_VERSIONS_TO_BUILD is empty, but BUN_VERSIONS_TO_BUILD is not,
# build all versions from versions.json
if [ -z "$NODE_VERSIONS_TO_BUILD" ]; then
  IFS=',' read -ra NODE_MAJOR_VERSIONS <<<"$NODE_MAJOR_VERSIONS_TO_CHECK"
  NODE_VERSIONS=()
  for node_major_version in "${NODE_MAJOR_VERSIONS[@]}"; do
    node_version=$(cat versions.json | jq -r ".nodejs.\"${node_major_version}\".version")
    if [ "$node_version" != "null" ]; then
      # Remove v from version
      NODE_VERSIONS+=("${node_version:1}")
    fi
  done
fi

log "Building Node versions: ${NODE_VERSIONS[*]}"

# If BUN_VERSIONS_TO_BUILD is empty, but NODE_VERSIONS_TO_BUILD is not,
# build all versions from versions.json
if [ -z "$BUN_VERSIONS_TO_BUILD" ]; then
  BUN_VERSIONS=()
  for bun_version in $(cat versions.json | jq -r '.bun | keys[]'); do
    BUN_VERSIONS+=("${bun_version:1}")
  done
fi

log "Building Bun versions: ${BUN_VERSIONS[*]}"

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
  local bun_version=$1
  local node_version=$2
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
  echo "$REGISTRY/bun-node:${bun_version}-${node_version}-${distro}"

  # Additional tags
  if [ $is_canary == false ]; then
    echo "$REGISTRY/bun-node:${bun_minor}-${node_version}-${distro}"
    echo "$REGISTRY/bun-node:${bun_major}-${node_version}-${distro}"
    echo "$REGISTRY/bun-node:${bun_version}-${node_minor}-${distro}"
    echo "$REGISTRY/bun-node:${bun_version}-${node_major}-${distro}"
    echo "$REGISTRY/bun-node:${bun_minor}-${node_minor}-${distro}"
    echo "$REGISTRY/bun-node:${bun_minor}-${node_major}-${distro}"
    echo "$REGISTRY/bun-node:${bun_major}-${node_minor}-${distro}"
    echo "$REGISTRY/bun-node:${bun_major}-${node_major}-${distro}"
  elif [[ $bun_version == "canary" ]]; then
    echo "$REGISTRY/bun-node:canary-${node_minor}-${distro}"
    echo "$REGISTRY/bun-node:canary-${node_major}-${distro}"
  fi

  # Special nodejs codename tags
  # Extract the codename for the current version
  local codename=$(echo "${json_data}" | jq -r ".nodejs.\"${node_major}\".name")
  echo "$REGISTRY/bun-node:${bun_version}-${codename}-${distro}"
  if [[ $is_canary == false ]]; then
    echo "$REGISTRY/bun-node:latest-${node_version}-${distro}"
    echo "$REGISTRY/bun-node:latest-${node_major}-${distro}"
    echo "$REGISTRY/bun-node:latest-${codename}-${distro}"
  fi

  # Special 'latest' tag
  local is_latest_lts=false
  if [[ "$node_major" == "20" ]]; then
    is_latest_lts=true
  fi
  if [[ $is_canary == false && $is_latest_lts == true && $distro == "debian" ]]; then
    echo "$REGISTRY/bun-node:latest"
  fi

  # Special 'node_major-distro' tag
  if [[ $is_canary == false ]]; then
    echo "$REGISTRY/bun-node:${node_major}-${distro}"
  fi
}

# Build, tag, and push loop
for bun_version in "${BUN_VERSIONS[@]}"; do
  for node_version in "${NODE_VERSIONS[@]}"; do
    for distro in "${DISTROS[@]}"; do
      tag_distro=$distro
      if [ "$distro" == "debian-slim" ]; then
        tag_distro="slim"
      fi

      # Generate tags
      tags=($(generate_tags "$bun_version" "$node_version" "$tag_distro"))

      # Building the image
      node_major=${node_version%%.*}
      log "Building image for Bun version $bun_version, Node version $node_version, Distro $distro"
      image_name="$REGISTRY/bun-node:${bun_versidon}-${node_version}-${tag_distro}"
      for tag in "${tags[@]}"; do
        log "Tagging $image_name as $tag"

        docker buildx build --platform "$PLATFORMS" -t "$image_name" -t "$tag" "./src/base/${node_major}/${distro}" --push

        # alpine image with git
        if [ "$distro" == "alpine" ]; then
          log "Building and Tagging Alpine image with Git"
          docker buildx build --platform "$PLATFORMS" -t "$image_name-git" -t "$tag-git" "./src/git/${node_major}/${distro}" --push
        fi
      done

      # On success, update the versions.json file
      log "Updating versions.json file"
      bun_tag="latest"
      if [[ $bun_version == *"-canary"* ]]; then
        bun_tag="canary"
      fi
      json_data=$(echo "${json_data}" | jq ".nodejs.\"${node_major}\".version = \"v${node_version}\"" | jq ".bun.\"${bun_tag}\" = \"v${bun_version}\"")
      echo "${json_data}" >versions.json
    done
  done
done
