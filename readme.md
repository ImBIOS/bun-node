# Bun and Node.js Docker Images: Optimize Your Development Workflow 🐇 🐳 🐢 🚀

[![dockeri.co](https://dockerico.blankenship.io/image/imbios/bun-node)](https://hub.docker.com/r/imbios/bun-node)
[![Docker Pulls](https://img.shields.io/docker/pulls/imbios/bun-node.svg "Docker Pulls")](https://hub.docker.com/r/imbios/bun-node)
[![Docker Stars](https://img.shields.io/docker/stars/imbios/bun-node.svg "Docker Stars")](https://hub.docker.com/r/imbios/bun-node)

[![GitHub issues](https://img.shields.io/github/issues/ImBIOS/bun-node.svg "GitHub issues")](https://github.com/ImBIOS/bun-node)
[![GitHub stars](https://img.shields.io/github/stars/ImBIOS/bun-node.svg "GitHub stars")](https://github.com/ImBIOS/bun-node)
![Test Coverage](https://github.com/ImBIOS/bun-node/raw/refs/heads/main/coverage.svg)
![CI Status](https://github.com/ImBIOS/bun-node/actions/workflows/ci.yml/badge.svg)
![Release Status](https://github.com/ImBIOS/bun-node/actions/workflows/release.yml/badge.svg)

[📊 Live Stats](https://bun-node.imbios.dev)

This repository offers pre-configured Docker images combining [Bun](https://bun.sh/), with [Node.js](https://nodejs.org/), the popular JavaScript runtime. Ideal for development, testing, and production environments.

Use node.js as runtime, and bun as package manager, etc. The node.js in this docker image functions as fallback when bun is not implement the feature yet.

## Features

- **Multiple Node.js Versions**: Supports Node.js versions which currently supported by [docker-node](https://github.com/nodejs/docker-node)
- **Variety of Builds**: Available in Alpine, Debian, and Slim versions

## Quick Start

```bash
docker pull imbios/bun-node
```

## Telemetry

The image sends **one anonymous ping per container start** to `bun-node.imbios.dev`
to help understand which versions are actually used. The payload contains only:

- the Bun and Node.js versions in the container
- the CPU architecture
- a random id (rotated every start)

The endpoint sees the container's source IP, and the random id is kept in KV for
up to one hour to deduplicate repeated pings; no hostnames, commands, or user
data are sent, and the ping fails silently (3s timeout, backgrounded) without
affecting startup. The recorded date is the server's UTC date.

**Opt out** with either:

```bash
docker run -e BUN_NODE_TELEMETRY=0 imbios/bun-node
# or
docker run -e DO_NOT_TRACK=1 imbios/bun-node
```

Live (public) and owner-only telemetry dashboards live at <https://bun-node.imbios.dev>.

## Build Types

- **alpine**: Minimal build ideal for smaller footprint
- **debian**: Standard build, balanced between size and features
- **slim**: Debian-based but lighter, stripped of unnecessary files
- Do you need `distroless` ?

## Advanced Image Tagging

```txt
imbios/bun-node:<bun-version>-<node-version>-<build-type>[optional -git]
```

- **bun-version**: Bun version (e.g. 1.0.0, 1.0.30, 1) or tag (e.g. latest or canary)
- **node-version**: Node.js version (e.g. 18, 20.11, 21.7.1) or tag (e.g. hydrogen, iron, current)
- **build-type**: Build type (e.g. alpine, debian, slim)
- **optional -git**: Optional git tag, an alpine image with git installed

## Show Your Support 🌟

If you find this Docker image useful, please consider giving it a ⭐ star on GitHub and Dockerhub! These stats tell me this code is useful for humanity and makes me prioritize maintenance.

## Contribution

Feel free to contribute by submitting pull requests or by reporting issues.

## Automation

Images are rebuilt daily by the [Release workflow](.github/workflows/release.yml):

- Node.js majors are tracked automatically via [`@nodevu/core`](https://github.com/cutenode/nodevu): when a new major goes
  Current/LTS its Dockerfiles are generated from [`templates/`](templates), and EOL majors are removed.
  The available `node:<major>-alpine*` tag is probed on Docker Hub so the newest Alpine is always used.
- The `latest` tag is re-pointed only after every build succeeds, so it always describes the most recent release.
- The version state (`versions.json`) is stored on the GitHub Release `versions` instead of in the repository.

Manual maintenance:

```sh
bun install

# check which Bun versions are current
bun run check-bun-node.ts --bun latest,canary

# print Node majors that changed vs the release state
bun run check-bun-node.ts --node --versions versions.json

# print the JSON build matrix (what would be built today)
bun run check-bun-node.ts --matrix --versions versions.json

# sync src/ with the supported Node majors (generate + cleanup)
bun run check-bun-node.ts --sync --versions versions.json
```

See [docs/research_matrix.md](docs/research_matrix.md) for why the release pipeline uses a workflow matrix.

## License

This project is licensed under the MIT License.

---

For custom configurations and support, visit [Project Wiki](https://github.com/ImBIOS/bun-node/wiki) or [Issues](https://github.com/ImBIOS/bun-node/issues).

## Keywords

Docker, Node.js, Bun, Development, Deployment, Alpine, Debian, Slim
