# TODO

- [🚀] Refactor versioning and tagging to more maintainable format
- [ ] Remove 14 and 16 after successful first build as docker-node does not support them already
- [ ] Add a test for the docker-node image

-[ ] When build success, push to docker hub, and update the versions.json file

NODE_VERSIONS_TO_BUILD="21.9.0,20.3.4,18.9.0" \
BUN_VERSIONS_TO_BUILD="1.0.9,1.0.9-canary.20231104.1" \
DISTROS="alpine,debian-slim,debian" \
PLATFORMS="linux/amd64,linux/arm64" \
REGISTRY="imbios" \
./build-updated.sh
