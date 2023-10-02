#!/bin/bash

# Convert comma-separated strings to arrays
IFS=',' read -ra versions <<<"$VERSIONS"
IFS=',' read -ra types <<<"$TYPES"

# Build, tag, and push loop
for version in "${versions[@]}"; do
  for type in "${types[@]}"; do
    tag_type=$type
    if [ "$type" == "debian-slim" ]; then
      tag_type="slim"
    fi

    docker buildx build --platform $PLATFORMS -t "$REGISTRY/bun-node:${version}-${tag_type}" "./${version}/${type}" --push

    if [ "$version" == "${versions[-1]}" ] && [ "$type" == "${types[-1]}" ]; then
      docker buildx build --platform $PLATFORMS -t "$REGISTRY/bun-node:latest" "./${version}/${type}" --push
    fi
  done
done
