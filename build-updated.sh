#!/bin/bash

# File to store last built versions
LAST_BUILT_FILE="versions.json"

# Function to check if a version is in the JSON array
version_in_json() {
  local version=$1
  local type=$2
  local versions=$(jq -r ".$type.$version" "$LAST_BUILT_FILE")
  [[ "$versions" == "null" ]] && return 1 || return 0
}

# Function to update JSON file
update_json() {
  local type=$1
  local version=$2
  local tag=$3
  jq ".$type.$version = \"$tag\"" "$LAST_BUILT_FILE" > temp.json && mv temp.json "$LAST_BUILT_FILE"
}

# Convert comma-separated strings to arrays
IFS=',' read -ra node_versions <<<"$NODE_VERSIONS"
IFS=',' read -ra bun_tags <<<"$BUN_TAGS"
IFS=',' read -ra distros <<<"$DISTROS"

# Check if LAST_BUILT_FILE exists
if [ ! -f "$LAST_BUILT_FILE" ]; then
  echo "{}" > $LAST_BUILT_FILE
fi

# Build, tag, and push loop
for bun_tag in "${bun_tags[@]}"; do
  for node_version in "${node_versions[@]}"; do
    if ! version_in_json "$node_version" "nodejs" || ! version_in_json "$bun_tag" "bun"; then
      for distro in "${distros[@]}"; do
        distro_tag=$distro
        if [ "$distro" == "debian-slim" ]; then
          distro_tag="slim"
        fi

        docker buildx build --platform $PLATFORMS --build-arg BUN_VERSION="$bun_tag" -t "$REGISTRY/bun-node:${bun_tag}-${node_version}-${distro_tag}" "./${version}/${distro}" --push

        if [ "$node_version" == "${node_versions[-1]}" ] && [ "$distro" == "${distros[-1]}" ]; then
          docker buildx build --platform $PLATFORMS -t "$REGISTRY/bun-node:latest" "./${node_version}/${distro}" --push
        fi
      done
      # Update JSON file
      update_json "nodejs" "$node_version" "$node_version"
      update_json "bun" "$bun_tag" "$bun_tag"
    fi
  done
done
