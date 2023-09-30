#!/bin/bash

registry="imbios"

# Versions and types
versions=("16" "18" "20")
types=("alpine" "debian" "debian-slim")

# Login to Docker Hub
docker login --username=$registry

# Build, tag, and push loop
for version in "${versions[@]}"; do
  for type in "${types[@]}"; do
    tag_type=$type
    if [ "$type" == "debian-slim" ]; then
      tag_type="slim"
    fi

    # Build image
    docker build -t "${registry}/bun-node:${version}-${tag_type}" "./${version}/${type}"

    # Push image to registry
    docker push "${registry}/bun-node:${version}-${tag_type}"
  done
done
