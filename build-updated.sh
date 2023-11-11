# TODO: Make this script more generic, configurable, and only build what's needed
#!/bin/bash

# Convert comma-separated strings to arrays
IFS=',' read -ra node_versions <<<"$NODE_VERSIONS"
IFS=',' read -ra bun_tags <<<"$BUN_TAGS"
IFS=',' read -ra distros <<<"$DISTROS"

# Build, tag, and push loop
for bun_tag in "${bun_tags[@]}"; do
  for node_version in "${node_versions[@]}"; do
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
  done
done
