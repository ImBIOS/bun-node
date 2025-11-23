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

# Retry function
retry() {
  local retries=${RETRIES:-3}
  local count=0
  until "$@"; do
    exit_code=$?
    count=$((count + 1))
    if [ $count -lt $retries ]; then
      log "Retrying ($count/$retries)..."
      sleep 5
    else
      log "Failed after $count attempts."
      return $exit_code
    fi
  done
  return 0
}

# Convert comma-separated strings to arrays
IFS=',' read -ra NODE_VERSIONS <<<"$NODE_VERSIONS_TO_BUILD"
IFS=',' read -ra BUN_VERSIONS <<<"$BUN_VERSIONS_TO_BUILD"
IFS=',' read -ra DISTROS <<<"$DISTROS"

# If NODE_VERSIONS_TO_BUILD is empty, but BUN_VERSIONS_TO_BUILD is not,
# build all versions from versions.json
# If NODE_VERSIONS_TO_BUILD is empty, but BUN_VERSIONS_TO_BUILD is not,
# we used to build all versions from versions.json.
# But for automatic updates, we want to build NOTHING if no Node versions are updated.
if [ -z "$NODE_VERSIONS_TO_BUILD" ]; then
  log "No Node.js versions to build."
  NODE_VERSIONS=()
fi

log "Building Node versions: ${NODE_VERSIONS[*]}"

# If BUN_VERSIONS_TO_BUILD is empty, but NODE_VERSIONS_TO_BUILD is not,
# build all versions from versions.json
# If BUN_VERSIONS_TO_BUILD is empty, but NODE_VERSIONS_TO_BUILD is not,
# we used to build all versions from versions.json.
# But for automatic updates, we want to build NOTHING if no Bun versions are updated.
if [ -z "$BUN_VERSIONS_TO_BUILD" ]; then
  log "No Bun versions to build."
  BUN_VERSIONS=()
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

  local is_canary=false
  if [[ $bun_version == *"-canary"* ]]; then
    is_canary=true
    bun_version="canary"
  fi

  echo "$REGISTRY/bun-node:${bun_version}-${node_version}-${distro}"

  if [ $is_canary == false ]; then
    echo "$REGISTRY/bun-node:${bun_minor}-${node_version}-${distro}"
    echo "$REGISTRY/bun-node:${bun_major}-${node_version}-${distro}"
    echo "$REGISTRY/bun-node:${bun_version}-${node_minor}-${distro}"
    echo "$REGISTRY/bun-node:${bun_version}-${node_major}-${distro}"
  elif [[ $bun_version == "canary" ]]; then
    echo "$REGISTRY/bun-node:canary-${node_minor}-${distro}"
    echo "$REGISTRY/bun-node:canary-${node_major}-${distro}"
  fi

  local codename=$(echo "${json_data}" | jq -r ".nodejs.\"${node_major}\".name")
  echo "$REGISTRY/bun-node:${bun_version}-${codename}-${distro}"

  if [[ $is_canary == false ]]; then
    echo "$REGISTRY/bun-node:latest-${node_version}-${distro}"
    echo "$REGISTRY/bun-node:latest-${node_major}-${distro}"
    echo "$REGISTRY/bun-node:latest-${codename}-${distro}"
  fi

  # Only tag "latest" if this is the latest Node.js version and Debian distro
  # We need to check if the current node_major is the latest one in versions.json
  # This is a bit tricky in bash without parsing JSON again, but we can assume the loop order or check against a known latest.
  # Better approach: The caller knows if it's the latest.
  # For now, let's restrict it to the highest known major version we support (e.g. 25) or check if it's the last one in the list?
  # Actually, the issue says "latest tag should be the last tag built".
  # If we build in order, the last one overwrites 'latest'.
  # BUT, if we build multiple versions, we might overwrite 'latest' with an older version if the loop isn't sorted or if we build an old version update.
  # A safer way is to explicitly check if this node version is the "latest" defined in versions.json.

  local latest_node_major=$(echo "${json_data}" | jq -r '.nodejs | keys | map(tonumber) | max')

  if [[ $is_canary == false && "$node_major" == "$latest_node_major" && $distro == "debian" ]]; then
    echo "$REGISTRY/bun-node:latest"
  fi

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

      tags=($(generate_tags "$bun_version" "$node_version" "$tag_distro"))

      node_major=${node_version%%.*}
      log "Building image for Bun version $bun_version, Node version $node_version, Distro $distro"
      image_name="$REGISTRY/bun-node:${bun_version}-${node_version}-${tag_distro}"

      for tag in "${tags[@]}"; do
        log "Tagging $image_name as $tag"
        retry docker buildx build --sbom=true --provenance=true --platform "$PLATFORMS" -t "$image_name" -t "$tag" "./src/base/${node_major}/${distro}" --push --provenance=mode=max

        if [ "$distro" == "alpine" ]; then
          log "Building and Tagging Alpine image with Git"
          retry docker buildx build --sbom=true --provenance=true --platform "$PLATFORMS" -t "$image_name-git" -t "$tag-git" "./src/git/${node_major}/${distro}" --push --provenance=mode=max
        fi
      done

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
