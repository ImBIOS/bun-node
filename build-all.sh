#!/bin/bash

# Convert comma-separated strings to arrays
IFS=',' read -ra node_versions <<<"$NODE_VERSIONS"
IFS=',' read -ra bun_version <<<"$BUN_VERSION"
IFS=',' read -ra distros <<<"$DISTROS"

# Build, tag, and push loop
for node_version in "${node_versions[@]}"; do
  for distro in "${distros[@]}"; do
    tag_distro=$distro
    if [ "$distro" == "debian-slim" ]; then
      tag_distro="slim"
    fi

    docker buildx build --platform $PLATFORMS -t "$REGISTRY/bun-node:${bun_version}-${node_version}-${tag_distro}" "./${version}/${distro}" --push

    if [ "$node_version" == "${node_versions[-1]}" ] && [ "$distro" == "${distros[-1]}" ]; then
      docker buildx build --platform $PLATFORMS -t "$REGISTRY/bun-node:latest" "./${node_version}/${distro}" --push
    fi
  done
done
