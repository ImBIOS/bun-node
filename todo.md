# TODO

- [🚀] Refactor versioning and tagging to more maintainable format
- [ ] Remove 14 and 16 after successful first build as docker-node does not support them already
- [ ] Add a test for the docker-node image

-[ ] When build success, push to docker hub, and update the versions.json file

NODE_VERSIONS_TO_BUILD="21.4.0,20.10.0,18.19.0,16.20.2,14.21.3" \
BUN_VERSIONS_TO_BUILD="1.0.15,1.0.15-canary.20231208.1" \
DISTROS="alpine,debian-slim,debian" \
PLATFORMS="linux/amd64,linux/arm64" \
REGISTRY="imbios" \
./build-updated.sh
