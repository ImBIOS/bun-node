#!/bin/bash

# Build and push a single bun-node image combination.
#
# Usage:
#   ./build_single.sh --bun <version> --node <version> --node-major <major> \
#     --codename <codename> --distro <distro> [--latest-candidate true|false]
#
# All version tags for the combination are pushed. The flat `latest` tag is
# intentionally NOT pushed here: it is re-pointed to the newest candidate in a
# dedicated finalize job so it is always the last tag touched in a release.

set -e

log() {
  echo "[$(date +'%Y-%m-%dT%H:%M:%S%z')] $*"
}

retry() {
  local retries=${RETRIES:-3}
  local count=0
  until "$@"; do
    local exit_code=$?
    count=$((count + 1))
    if [ "$count" -lt "$retries" ]; then
      log "Retrying ($count/$retries)..."
      sleep 5
    else
      log "Failed after $count attempts."
      return "$exit_code"
    fi
  done
  return 0
}

LATEST_CANDIDATE=false

while [[ "$#" -gt 0 ]]; do
  case $1 in
    --bun) BUN_VERSION="$2"; shift ;;
    --node) NODE_VERSION="$2"; shift ;;
    --node-major) NODE_MAJOR="$2"; shift ;;
    --codename) CODENAME="$2"; shift ;;
    --distro) DISTRO="$2"; shift ;;
    --bun-tag) BUN_TAG="$2"; shift ;;
    --latest-candidate) LATEST_CANDIDATE="$2"; shift ;;
    *) echo "Unknown parameter passed: $1"; exit 1 ;;
  esac
  shift
done

if [ -z "${BUN_VERSION:-}" ] || [ -z "${NODE_VERSION:-}" ] || [ -z "${NODE_MAJOR:-}" ] || [ -z "${DISTRO:-}" ]; then
  echo "Usage: $0 --bun <version> --node <version> --node-major <major> --distro <distro> [--codename <name>] [--bun-tag <tag>] [--latest-candidate true|false]"
  exit 1
fi

BUN_TAG=${BUN_TAG:-latest}
if [[ "$BUN_VERSION" == *"-canary"* ]]; then
  BUN_TAG="canary"
fi

REGISTRY=${REGISTRY:-imbios}
PLATFORMS=${PLATFORMS:-linux/amd64,linux/arm64}
CODENAME=${CODENAME:-}

tag_distro="$DISTRO"
if [ "$DISTRO" == "debian-slim" ]; then
  tag_distro="slim"
fi

generate_tags() {
  local bun_version=$1
  local node_version=$2
  local distro=$3

  local node_minor=${node_version%.*}
  local bun_major=${bun_version%%.*}
  local bun_minor=${bun_version%.*}
  local is_canary=false

  if [ "$bun_version" == "canary" ]; then
    is_canary=true
  fi

  echo "$REGISTRY/bun-node:${bun_version}-${node_version}-${distro}"

  if [ "$is_canary" == false ]; then
    echo "$REGISTRY/bun-node:${bun_minor}-${node_version}-${distro}"
    echo "$REGISTRY/bun-node:${bun_major}-${node_version}-${distro}"
    echo "$REGISTRY/bun-node:${bun_version}-${node_minor}-${distro}"
    echo "$REGISTRY/bun-node:${bun_version}-${NODE_MAJOR}-${distro}"
  else
    echo "$REGISTRY/bun-node:canary-${node_minor}-${distro}"
    echo "$REGISTRY/bun-node:canary-${NODE_MAJOR}-${distro}"
  fi

  if [ -n "$CODENAME" ]; then
    echo "$REGISTRY/bun-node:${bun_version}-${CODENAME}-${distro}"
    if [ "$is_canary" == false ]; then
      echo "$REGISTRY/bun-node:latest-${CODENAME}-${distro}"
    fi
  fi

  if [ "$is_canary" == false ]; then
    echo "$REGISTRY/bun-node:latest-${node_version}-${distro}"
    echo "$REGISTRY/bun-node:latest-${NODE_MAJOR}-${distro}"
    echo "$REGISTRY/bun-node:${NODE_MAJOR}-${distro}"
  fi
}

bun_build_arg="$BUN_VERSION"
if [[ "$BUN_VERSION" == *"-canary"* ]]; then
  bun_build_arg="canary"
fi

log "Building image for Bun version $BUN_VERSION, Node version $NODE_VERSION, Distro $DISTRO"
image_name="$REGISTRY/bun-node:${BUN_VERSION}-${NODE_VERSION}-${tag_distro}"
tags=($(generate_tags "$BUN_VERSION" "$NODE_VERSION" "$tag_distro"))

for tag in "${tags[@]}"; do
  log "Tagging $image_name as $tag"
  retry docker buildx build \
    --sbom=true --provenance=true \
    --platform "$PLATFORMS" \
    -t "$image_name" -t "$tag" \
    --build-arg BUN_VERSION="$bun_build_arg" \
    "./src/base/${NODE_MAJOR}/${DISTRO}" \
    --push

  if [ "$DISTRO" == "alpine" ]; then
    log "Building and Tagging Alpine image with Git"
    retry docker buildx build \
      --sbom=true --provenance=true \
      --platform "$PLATFORMS" \
      -t "$image_name-git" -t "$tag-git" \
      --build-arg BUN_VERSION="$bun_build_arg" \
      "./src/git/${NODE_MAJOR}/alpine" \
      --push
  fi
done

cat > build_success.json <<EOF
{
  "bun": { "$BUN_TAG": "v$BUN_VERSION" },
  "nodejs": { "$NODE_MAJOR": { "name": "$CODENAME", "version": "v$NODE_VERSION" } },
  "latest_candidate": $LATEST_CANDIDATE
}
EOF

log "Done: $image_name"
