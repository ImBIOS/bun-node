#!/bin/bash

registry="imbios"

# Platforms
platforms="linux/amd64,linux/arm64"

# Versions and types
versions=("16" "18" "20")
types=("alpine" "debian-slim" "debian")

# Login to Docker Hub
docker login --username=$registry

# Build, tag, and push loop
for version in "${versions[@]}"; do
  for type in "${types[@]}"; do
    tag_type=$type
    if [ "$type" == "debian-slim" ]; then
      tag_type="slim"
    fi

    # Build multi-platform image
    docker buildx build --platform $platforms -t "${registry}/bun-node:${version}-${tag_type}" "./${version}/${type}" --push

    # If version is last and type is last, tag as latest
    if [ "$version" == "${versions[-1]}" ] && [ "$type" == "${types[-1]}" ]; then
      docker buildx build --platform $platforms -t "${registry}/bun-node:latest" "./${version}/${type}" --push
    fi
  done
done
