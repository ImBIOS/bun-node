# Bun and Node.js Docker Images: Optimize Your Development Workflow 🐇 🐳 🐢 🚀

[![dockeri.co](https://dockerico.blankenship.io/image/imbios/bun-node)](https://hub.docker.com/r/imbios/bun-node)

[![GitHub issues](https://img.shields.io/github/issues/ImBIOS/bun-node.svg "GitHub issues")](https://github.com/ImBIOS/bun-node)
[![GitHub stars](https://img.shields.io/github/stars/ImBIOS/bun-node.svg "GitHub stars")](https://github.com/ImBIOS/bun-node)
![Test Coverage](https://github.com/ImBIOS/bun-node/raw/refs/heads/main/coverage.svg)
![CI Status](https://github.com/ImBIOS/bun-node/actions/workflows/ci.yml/badge.svg)
![Release Status](https://github.com/ImBIOS/bun-node/actions/workflows/release.yml/badge.svg)

This repository offers pre-configured Docker images combining [Bun](https://bun.sh/), with [Node.js](https://nodejs.org/), the popular JavaScript runtime. Ideal for development, testing, and production environments.

Use node.js as runtime, and bun as package manager, etc. The node.js in this docker image functions as fallback when bun is not implement the feature yet.

## Features

- **Multiple Node.js Versions**: Supports Node.js versions which currently supported by [docker-node](https://github.com/nodejs/docker-node)
- **Variety of Builds**: Available in Alpine, Debian, and Slim versions

## Quick Start

```bash
docker pull imbios/bun-node
```

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

## License

This project is licensed under the MIT License.

---

For custom configurations and support, visit [Project Wiki](https://github.com/ImBIOS/bun-node/wiki) or [Issues](https://github.com/ImBIOS/bun-node/issues).

## Keywords

Docker, Node.js, Bun, Development, Deployment, Alpine, Debian, Slim
