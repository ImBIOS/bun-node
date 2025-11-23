#!/bin/bash

# Exit on error
set -e

# Logging function
log() {
  echo "[$(date +'%Y-%m-%dT%H:%M:%S%z')] $@"
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

# Parse arguments
while [[ "$#" -gt 0 ]]; do
  case $1 in
    --bun) BUN_VERSION="$2"; shift ;;
    --node) NODE_VERSION="$2"; shift ;;
    --distro) DISTRO="$2"; shift ;;
    *) echo "Unknown parameter passed: $1"; exit 1 ;;
  esac
  shift
done

if [ -z "$BUN_VERSION" ] || [ -z "$NODE_VERSION" ] || [ -z "$DISTRO" ]; then
  echo "Usage: $0 --bun <version> --node <version> --distro <distro>"
  exit 1
fi

log "Building image for Bun version $BUN_VERSION, Node version $NODE_VERSION, Distro $DISTRO"

# Read versions.json for codename lookup (optional, but good for tagging)
# If versions.json is not present, we might miss some tags, but the matrix generation should have ensured we have what we need.
# Actually, we need versions.json to know the codename (e.g. "Iron") and to check if it's "latest".
# We can expect versions.json to be present in the working directory (downloaded by workflow).

if [ -f "versions.json" ]; then
  json_data=$(cat versions.json)
else
  json_data="{}"
fi

REGISTRY=${REGISTRY:-imbios}
PLATFORMS=${PLATFORMS:-linux/amd64,linux/arm64}

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
  if [ "$codename" != "null" ]; then
      echo "$REGISTRY/bun-node:${bun_version}-${codename}-${distro}"
      if [[ $is_canary == false ]]; then
        echo "$REGISTRY/bun-node:latest-${codename}-${distro}"
      fi
  fi

  if [[ $is_canary == false ]]; then
    echo "$REGISTRY/bun-node:latest-${node_version}-${distro}"
    echo "$REGISTRY/bun-node:latest-${node_major}-${distro}"
  fi

  # Latest tag logic
  # We rely on the caller (workflow) or check versions.json to see if this is the latest Node version.
  local latest_node_major=$(echo "${json_data}" | jq -r '.nodejs | keys | map(tonumber) | max')

  if [[ $is_canary == false && "$node_major" == "$latest_node_major" && $distro == "debian" ]]; then
    echo "$REGISTRY/bun-node:latest"
  fi

  if [[ $is_canary == false ]]; then
    echo "$REGISTRY/bun-node:${node_major}-${distro}"
  fi
}

tag_distro=$DISTRO
if [ "$DISTRO" == "debian-slim" ]; then
  tag_distro="slim"
fi

tags=($(generate_tags "$BUN_VERSION" "$NODE_VERSION" "$tag_distro"))
image_name="$REGISTRY/bun-node:${BUN_VERSION}-${NODE_VERSION}-${tag_distro}"

node_major=${NODE_VERSION%%.*}

for tag in "${tags[@]}"; do
  log "Tagging $image_name as $tag"
  retry docker buildx build --sbom=true --provenance=true --platform "$PLATFORMS" -t "$image_name" -t "$tag" "./src/base/${node_major}/${DISTRO}" --push --provenance=mode=max

  if [ "$DISTRO" == "alpine" ]; then
    log "Building and Tagging Alpine image with Git"
    retry docker buildx build --sbom=true --provenance=true --platform "$PLATFORMS" -t "$image_name-git" -t "$tag-git" "./src/git/${node_major}/${DISTRO}" --push --provenance=mode=max
  fi
done

# Output success JSON fragment for aggregation
# We need to update versions.json with the new versions.
# We output a JSON file that the workflow can pick up.
bun_tag="latest"
if [[ $BUN_VERSION == *"-canary"* ]]; then
  bun_tag="canary"
fi

# Create a partial JSON update
echo "{\"nodejs\": {\"$node_major\": {\"version\": \"v$NODE_VERSION\"}}, \"bun\": {\"$bun_tag\": \"v$BUN_VERSION\"}}" > build_success.json
