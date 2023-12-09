#!/bin/bash

# Color variables
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Function to log in green
log_success() {
  echo -e "${GREEN}$1${NC}"
}

# Function to log in yellow
log_warning() {
  echo -e "${YELLOW}$1${NC}"
}

# Function to log in red
log_error() {
  echo -e "${RED}$1${NC}"
}

log_success "Starting script..."

# File to store last built versions
LAST_BUILT_FILE="versions.json"

log_success "Using last built file: $LAST_BUILT_FILE"

# Function to check if a version is in the JSON array
version_in_json() {
  local version=$1
  local type=$2
  local versions=$(jq -r ".${type}[\"${version}\"] | .version" "$LAST_BUILT_FILE")
  log_warning "Checking if $version is in $LAST_BUILT_FILE under $type: $versions"
  [[ "$versions" == "null" ]] && return 1 || return 0
}

# Function to update JSON file
update_json() {
  local type=$1
  local version=$2
  local version_number=$3
  local version_name=$4
  jq ".$type[\"$version\"].version = \"$version_number\"" "$LAST_BUILT_FILE" > temp.json && mv temp.json "$LAST_BUILT_FILE"
  jq ".$type[\"$version\"].name = \"$version_name\"" "$LAST_BUILT_FILE" > temp.json && mv temp.json "$LAST_BUILT_FILE"
  log_success "Updated $LAST_BUILT_FILE: Set $type $version to $version_number and name to $version_name"
}

# Convert comma-separated strings to arrays
IFS=',' read -ra node_versions <<<"$NODE_VERSIONS"
IFS=',' read -ra bun_tags <<<"$BUN_TAGS"
IFS=',' read -ra distros <<<"$DISTROS"

log_success "Node versions: ${node_versions[@]}"
log_success "Bun tags: ${bun_tags[@]}"
log_success "Distros: ${distros[@]}"

# Check if LAST_BUILT_FILE exists
if [ ! -f "$LAST_BUILT_FILE" ]; then
  echo "{}" > $LAST_BUILT_FILE
  log_warning "$LAST_BUILT_FILE did not exist, created new file."
fi

# Get the last index of node_versions and distros
last_node_version_index=$((${#node_versions[@]} - 1))
last_distro_index=$((${#distros[@]} - 1))

# Build, tag, and push loop
for bun_tag in "${bun_tags[@]}"; do
  for i in "${!node_versions[@]}"; do
    node_version=${node_versions[$i]}
    if ! version_in_json "$node_version" "nodejs" || ! version_in_json "$bun_tag" "bun"; then
      log_success "Building for Node version $node_version and Bun tag $bun_tag"
      for j in "${!distros[@]}"; do
        distro=${distros[$j]}
        distro_tag=$distro
        if [ "$distro" == "debian-slim" ]; then
          distro_tag="slim"
        fi
        log_success "Building for Distro: $distro (Tag: $distro_tag)"

        # Add your docker build command here
        log_success "docker buildx build --platform $PLATFORMS --build-arg BUN_VERSION=\"$bun_tag\" -t \"$REGISTRY/bun-node:${bun_tag}-${node_version}-${distro_tag}\" \"./${version}/${distro}\" --push"

        if [ "$i" -eq "$last_node_version_index" ] && [ "$j" -eq "$last_distro_index" ]; then
          log_success "Building latest tag"
          # Add your docker build command for the latest tag here
          log_success "docker buildx build --platform $PLATFORMS -t \"$REGISTRY/bun-node:latest\" \"./${node_version}/${distro}\" --push"
        fi
      done
      # Update JSON file
      # Dummy version name and number for example, replace with real values
      update_json "nodejs" "$node_version" "XX.X.X" "Codename"
      update_json "bun" "$bun_tag" "$bun_tag" # For bun, there might not be a nested structure
    else
      log_error "Skipping build for Node version $node_version and Bun tag $bun_tag as it's already built."
    fi
  done
done

log_success "Script finished."
