#!/usr/bin/env bun
/**
 * Usage:
 *   bun check-bun-node.ts --bun canary,latest
 *   bun check-bun-node.ts --node 20,22,24,25
 */

// @ts-expect-error - no types
import nodevu from "@nodevu/core";
import { $ } from "bun";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const nodevuData = await nodevu({ fetch });

const DEBIAN_TEMPLATE = (major: number) => `FROM debian:bookworm-slim AS build

# https://github.com/oven-sh/bun/releases
ARG BUN_VERSION=latest

# Node.js includes python3 for node-gyp, see https://github.com/oven-sh/bun/issues/9807
# Though, not on slim and alpine images.
RUN apt-get update -qq \\
  && apt-get install -qq --no-install-recommends \\
  ca-certificates \\
  curl \\
  dirmngr \\
  gpg \\
  gpg-agent \\
  unzip \\
  python3 \\
  && apt-get clean \\
  && rm -rf /var/lib/apt/lists/* \\
  && arch="$(dpkg --print-architecture)" \\
  && case "\${arch##*-}" in \\
  amd64) build="x64-baseline";; \\
  arm64) build="aarch64";; \\
  *) echo "error: unsupported architecture: $arch"; exit 1 ;; \\
  esac \\
  && version="$BUN_VERSION" \\
  && case "$version" in \\
  latest | canary | bun-v*) tag="$version"; ;; \\
  v*)                       tag="bun-$version"; ;; \\
  *)                        tag="bun-v$version"; ;; \\
  esac \\
  && case "$tag" in \\
  latest) release="latest/download"; ;; \\
  *)      release="download/$tag"; ;; \\
  esac \\
  && curl "https://github.com/oven-sh/bun/releases/$release/bun-linux-$build.zip" \\
  -fsSLO \\
  --compressed \\
  --retry 5 \\
  || (echo "error: failed to download: $tag" && exit 1) \\
  && for key in \\
  "F3DCC08A8572C0749B3E18888EAB4D40A7B22B59" \\
  ; do \\
  gpg --batch --keyserver hkps://keys.openpgp.org --recv-keys "$key" \\
  || gpg --batch --keyserver keyserver.ubuntu.com --recv-keys "$key" ; \\
  done \\
  && curl "https://github.com/oven-sh/bun/releases/$release/SHASUMS256.txt.asc" \\
  -fsSLO \\
  --compressed \\
  --retry 5 \\
  && gpg --batch --decrypt --output SHASUMS256.txt SHASUMS256.txt.asc \\
  || (echo "error: failed to verify: $tag" && exit 1) \\
  && grep " bun-linux-$build.zip\\$" SHASUMS256.txt | sha256sum -c - \\
  || (echo "error: failed to verify: $tag" && exit 1) \\
  && unzip "bun-linux-$build.zip" \\
  && mv "bun-linux-$build/bun" /usr/local/bin/bun \\
  && rm -f "bun-linux-$build.zip" SHASUMS256.txt.asc SHASUMS256.txt \\
  && chmod +x /usr/local/bin/bun

FROM node:${major}-bookworm

COPY docker-entrypoint.sh /usr/local/bin
COPY --from=build /usr/local/bin/bun /usr/local/bin/bun
RUN mkdir -p /usr/local/bun-node-fallback-bin && ln -s /usr/local/bin/bun /usr/local/bun-node-fallback-bin/node
ENV PATH "\${PATH}:/usr/local/bun-node-fallback-bin"

# Disable the runtime transpiler cache by default inside Docker containers.
# On ephemeral containers, the cache is not useful
ARG BUN_RUNTIME_TRANSPILER_CACHE_PATH=0
ENV BUN_RUNTIME_TRANSPILER_CACHE_PATH=\${BUN_RUNTIME_TRANSPILER_CACHE_PATH}

# Ensure \`bun install -g\` works
ARG BUN_INSTALL_BIN=/usr/local/bin
ENV BUN_INSTALL_BIN=\${BUN_INSTALL_BIN}

RUN groupadd bun \\
  --gid 1001 \\
  && useradd bun \\
  --uid 1001 \\
  --gid bun \\
  --shell /bin/sh \\
  --create-home \\
  && ln -s /usr/local/bin/bun /usr/local/bin/bunx \\
  && which bun \\
  && which bunx \\
  && bun --version

WORKDIR /home/bun/app
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["/usr/local/bin/bun"]
`;

const SLIM_TEMPLATE = (major: number) => `FROM debian:bookworm-slim AS build

# https://github.com/oven-sh/bun/releases
ARG BUN_VERSION=latest

RUN apt-get update -qq \\
  && apt-get install -qq --no-install-recommends \\
  ca-certificates \\
  curl \\
  dirmngr \\
  gpg \\
  gpg-agent \\
  unzip \\
  && apt-get clean \\
  && rm -rf /var/lib/apt/lists/* \\
  && arch="$(dpkg --print-architecture)" \\
  && case "\${arch##*-}" in \\
  amd64) build="x64-baseline";; \\
  arm64) build="aarch64";; \\
  *) echo "error: unsupported architecture: $arch"; exit 1 ;; \\
  esac \\
  && version="$BUN_VERSION" \\
  && case "$version" in \\
  latest | canary | bun-v*) tag="$version"; ;; \\
  v*)                       tag="bun-$version"; ;; \\
  *)                        tag="bun-v$version"; ;; \\
  esac \\
  && case "$tag" in \\
  latest) release="latest/download"; ;; \\
  *)      release="download/$tag"; ;; \\
  esac \\
  && curl "https://github.com/oven-sh/bun/releases/$release/bun-linux-$build.zip" \\
  -fsSLO \\
  --compressed \\
  --retry 5 \\
  || (echo "error: failed to download: $tag" && exit 1) \\
  && for key in \\
  "F3DCC08A8572C0749B3E18888EAB4D40A7B22B59" \\
  ; do \\
  gpg --batch --keyserver hkps://keys.openpgp.org --recv-keys "$key" \\
  || gpg --batch --keyserver keyserver.ubuntu.com --recv-keys "$key" ; \\
  done \\
  && curl "https://github.com/oven-sh/bun/releases/$release/SHASUMS256.txt.asc" \\
  -fsSLO \\
  --compressed \\
  --retry 5 \\
  && gpg --batch --decrypt --output SHASUMS256.txt SHASUMS256.txt.asc \\
  || (echo "error: failed to verify: $tag" && exit 1) \\
  && grep " bun-linux-$build.zip\\$" SHASUMS256.txt | sha256sum -c - \\
  || (echo "error: failed to verify: $tag" && exit 1) \\
  && unzip "bun-linux-$build.zip" \\
  && mv "bun-linux-$build/bun" /usr/local/bin/bun \\
  && rm -f "bun-linux-$build.zip" SHASUMS256.txt.asc SHASUMS256.txt \\
  && chmod +x /usr/local/bin/bun \\
  && which bun \\
  && bun --version

FROM node:${major}-bookworm-slim

# Disable the runtime transpiler cache by default inside Docker containers.
# On ephemeral containers, the cache is not useful
ARG BUN_RUNTIME_TRANSPILER_CACHE_PATH=0
ENV BUN_RUNTIME_TRANSPILER_CACHE_PATH=\${BUN_RUNTIME_TRANSPILER_CACHE_PATH}

# Ensure \`bun install -g\` works
ARG BUN_INSTALL_BIN=/usr/local/bin
ENV BUN_INSTALL_BIN=\${BUN_INSTALL_BIN}

COPY docker-entrypoint.sh /usr/local/bin
COPY --from=build /usr/local/bin/bun /usr/local/bin/bun
RUN mkdir -p /usr/local/bun-node-fallback-bin && ln -s /usr/local/bin/bun /usr/local/bun-node-fallback-bin/node
ENV PATH "\${PATH}:/usr/local/bun-node-fallback-bin"

RUN groupadd bun \\
  --gid 1001 \\
  && useradd bun \\
  --uid 1001 \\
  --gid bun \\
  --shell /bin/sh \\
  --create-home \\
  && ln -s /usr/local/bin/bun /usr/local/bin/bunx \\
  && which bun \\
  && which bunx \\
  && bun --version

WORKDIR /home/bun/app
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["/usr/local/bin/bun"]
`;

const ALPINE_TEMPLATE = (major: number, alpineVer: string) => `FROM alpine:${alpineVer} AS build

# https://github.com/oven-sh/bun/releases
ARG BUN_VERSION=latest

RUN apk --no-cache add ca-certificates curl dirmngr gpg gpg-agent unzip \\
  && arch="$(apk --print-arch)" \\
  && case "\${arch##*-}" in \\
  x86_64) build="x64-musl-baseline";; \\
  aarch64) build="aarch64-musl";; \\
  *) echo "error: unsupported architecture: $arch"; exit 1 ;; \\
  esac \\
  && version="$BUN_VERSION" \\
  && case "$version" in \\
  latest | canary | bun-v*) tag="$version"; ;; \\
  v*)                       tag="bun-$version"; ;; \\
  *)                        tag="bun-v$version"; ;; \\
  esac \\
  && case "$tag" in \\
  latest) release="latest/download"; ;; \\
  *)      release="download/$tag"; ;; \\
  esac \\
  && curl "https://github.com/oven-sh/bun/releases/$release/bun-linux-$build.zip" \\
  -fsSLO \\
  --compressed \\
  --retry 5 \\
  || (echo "error: failed to download: $tag" && exit 1) \\
  && for key in \\
  "F3DCC08A8572C0749B3E18888EAB4D40A7B22B59" \\
  ; do \\
  gpg --batch --keyserver hkps://keys.openpgp.org --recv-keys "$key" \\
  || gpg --batch --keyserver keyserver.ubuntu.com --recv-keys "$key" ; \\
  done \\
  && curl "https://github.com/oven-sh/bun/releases/$release/SHASUMS256.txt.asc" \\
  -fsSLO \\
  --compressed \\
  --retry 5 \\
  && gpg --batch --decrypt --output SHASUMS256.txt SHASUMS256.txt.asc \\
  || (echo "error: failed to verify: $tag" && exit 1) \\
  && grep " bun-linux-$build.zip\\$" SHASUMS256.txt | sha256sum -c - \\
  || (echo "error: failed to verify: $tag" && exit 1) \\
  && unzip "bun-linux-$build.zip" \\
  && mv "bun-linux-$build/bun" /usr/local/bin/bun \\
  && rm -f "bun-linux-$build.zip" SHASUMS256.txt.asc SHASUMS256.txt \\
  && chmod +x /usr/local/bin/bun

FROM node:${major}-alpine${alpineVer}

# Disable the runtime transpiler cache by default inside Docker containers.
# On ephemeral containers, the cache is not useful
ARG BUN_RUNTIME_TRANSPILER_CACHE_PATH=0
ENV BUN_RUNTIME_TRANSPILER_CACHE_PATH=\${BUN_RUNTIME_TRANSPILER_CACHE_PATH}

# Ensure \`bun install -g\` works
ARG BUN_INSTALL_BIN=/usr/local/bin
ENV BUN_INSTALL_BIN=\${BUN_INSTALL_BIN}

COPY --from=build /usr/local/bin/bun /usr/local/bin/
COPY docker-entrypoint.sh /usr/local/bin/
RUN mkdir -p /usr/local/bun-node-fallback-bin && ln -s /usr/local/bin/bun /usr/local/bun-node-fallback-bin/node
ENV PATH "\${PATH}:/usr/local/bun-node-fallback-bin"

# Temporarily use the \`build\`-stage /tmp folder to access the glibc APKs:
RUN --mount=type=bind,from=build,source=/tmp,target=/tmp \\
  addgroup -g 1001 bun \\
  && adduser -u 1001 -G bun -s /bin/sh -D bun \\
  && ln -s /usr/local/bin/bun /usr/local/bin/bunx \\
  && apk add libgcc libstdc++ \\
  && which bun \\
  && which bunx \\
  && bun --version

WORKDIR /home/bun/app
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["/usr/local/bin/bun"]
`;

const GIT_ALPINE_TEMPLATE = (major: number, alpineVer: string) => `FROM alpine:${alpineVer} AS build

# https://github.com/oven-sh/bun/releases
ARG BUN_VERSION=latest

RUN apk --no-cache add ca-certificates curl dirmngr gpg gpg-agent unzip \\
  && arch="$(apk --print-arch)" \\
  && case "\${arch##*-}" in \\
  x86_64) build="x64-musl-baseline";; \\
  aarch64) build="aarch64-musl";; \\
  *) echo "error: unsupported architecture: $arch"; exit 1 ;; \\
  esac \\
  && version="$BUN_VERSION" \\
  && case "$version" in \\
  latest | canary | bun-v*) tag="$version"; ;; \\
  v*)                       tag="bun-$version"; ;; \\
  *)                        tag="bun-v$version"; ;; \\
  esac \\
  && case "$tag" in \\
  latest) release="latest/download"; ;; \\
  *)      release="download/$tag"; ;; \\
  esac \\
  && curl "https://github.com/oven-sh/bun/releases/$release/bun-linux-$build.zip" \\
  -fsSLO \\
  --compressed \\
  --retry 5 \\
  || (echo "error: failed to download: $tag" && exit 1) \\
  && for key in \\
  "F3DCC08A8572C0749B3E18888EAB4D40A7B22B59" \\
  ; do \\
  gpg --batch --keyserver hkps://keys.openpgp.org --recv-keys "$key" \\
  || gpg --batch --keyserver keyserver.ubuntu.com --recv-keys "$key" ; \\
  done \\
  && curl "https://github.com/oven-sh/bun/releases/$release/SHASUMS256.txt.asc" \\
  -fsSLO \\
  --compressed \\
  --retry 5 \\
  && gpg --batch --decrypt --output SHASUMS256.txt SHASUMS256.txt.asc \\
  || (echo "error: failed to verify: $tag" && exit 1) \\
  && grep " bun-linux-$build.zip\\$" SHASUMS256.txt | sha256sum -c - \\
  || (echo "error: failed to verify: $tag" && exit 1) \\
  && unzip "bun-linux-$build.zip" \\
  && mv "bun-linux-$build/bun" /usr/local/bin/bun \\
  && rm -f "bun-linux-$build.zip" SHASUMS256.txt.asc SHASUMS256.txt \\
  && chmod +x /usr/local/bin/bun

FROM node:${major}-alpine${alpineVer}

# Disable the runtime transpiler cache by default inside Docker containers.
# On ephemeral containers, the cache is not useful
ARG BUN_RUNTIME_TRANSPILER_CACHE_PATH=0
ENV BUN_RUNTIME_TRANSPILER_CACHE_PATH=\${BUN_RUNTIME_TRANSPILER_CACHE_PATH}

# Ensure \`bun install -g\` works
ARG BUN_INSTALL_BIN=/usr/local/bin
ENV BUN_INSTALL_BIN=\${BUN_INSTALL_BIN}

COPY --from=build /usr/local/bin/bun /usr/local/bin/
COPY docker-entrypoint.sh /usr/local/bin/
RUN mkdir -p /usr/local/bun-node-fallback-bin && ln -s /usr/local/bin/bun /usr/local/bun-node-fallback-bin/node
ENV PATH "\${PATH}:/usr/local/bun-node-fallback-bin"

# Temporarily use the \`build\`-stage /tmp folder to access the glibc APKs:
RUN --mount=type=bind,from=build,source=/tmp,target=/tmp \\
  addgroup -g 1001 bun \\
  && adduser -u 1001 -G bun -s /bin/sh -D bun \\
  && ln -s /usr/local/bin/bun /usr/local/bin/bunx \\
  && apk add libgcc libstdc++ \\
  && which bun \\
  && which bunx \\
  && bun --version

# Add git
RUN apk fix && \\
  apk --no-cache --update add git git-lfs gpg less openssh patch && \\
  git lfs install

WORKDIR /home/bun/app
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["/usr/local/bin/bun"]
`;




  // ... existing logic ...

/**
 * Filters Node.js release data to return only major releases with documented support.
 */
async function getMajorNodeReleases() {
  return Object.entries(
    nodevuData as Record<
      string,
      {
        releases: Record<
          string,
          {
            modules: { version: string };
            dependencies: { npm: string; v8: string };
            semver: {
              major: number;
              minor: number;
              patch: number;
              raw: string;
            };
            releaseDate: string;
          }
        >;
        support: {
          phases: {
            dates: {
              start: string;
              lts: string;
              maintenance: string;
              end: string;
            };
          };
          codename: string;
        };
      }
    >
  ).filter(([version, { support }]) => {
    // Filter out those without documented support
    // Basically those not in schedule.json
    if (!support) {
      return false;
    }

    // nodevu returns duplicated v0.x versions (v0.12, v0.10, ...).
    // This behavior seems intentional as the case is hardcoded in nodevu,
    // see https://github.com/cutenode/nodevu/blob/0c8538c70195fb7181e0a4d1eeb6a28e8ed95698/core/index.js#L24.
    // This line ignores those duplicated versions and takes the latest
    // v0.x version (v0.12.18). It is also consistent with the legacy
    // nodejs.org implementation.
    if (version.startsWith("v0.") && version !== "v0.12") {
      return false;
    }

    return true;
  });
}

// Gets the appropriate release status for each major release
const getNodeReleaseStatus = (
  now: Date,
  support: {
    endOfLife: string;
    maintenanceStart: string;
    ltsStart: string;
    currentStart: string;
  }
) => {
  const { endOfLife, maintenanceStart, ltsStart, currentStart } = support;

  if (endOfLife && now >= new Date(endOfLife)) {
    return "End-of-life";
  }

  if (maintenanceStart && now >= new Date(maintenanceStart)) {
    return "Maintenance LTS";
  }

  if (ltsStart && now >= new Date(ltsStart)) {
    return "Active LTS";
  }

  if (currentStart && now >= new Date(currentStart)) {
    return "Current";
  }

  return "Pending";
};

/**
 * This method is used to generate the Node.js Release Data
 * for self-consumption during RSC and Static Builds
 *
 * @returns {Promise<Array<import('../../types').NodeRelease>>}
 */
const generateReleaseData = async () => {
  const majors = await getMajorNodeReleases();

  return majors.map(([, major]) => {
    const [latestVersion] = Object.values(major.releases);

    const support = {
      currentStart: major.support.phases.dates.start,
      ltsStart: major.support.phases.dates.lts,
      maintenanceStart: major.support.phases.dates.maintenance,
      endOfLife: major.support.phases.dates.end,
    };

    // Get the major release status based on our Release Schedule
    const status = getNodeReleaseStatus(new Date(), support);

    const minorVersions = Object.entries(major.releases).map(([, release]) => ({
      modules: release.modules.version || "",
      npm: release.dependencies.npm || "",
      releaseDate: release.releaseDate,
      v8: release.dependencies.v8,
      version: release.semver.raw,
      versionWithPrefix: `v${release.semver.raw}`,
    }));

    if (!latestVersion) {
      return null;
    }

    return {
      ...support,
      status,
      major: latestVersion.semver.major,
      version: latestVersion.semver.raw,
      versionWithPrefix: `v${latestVersion.semver.raw}`,
      codename: major.support.codename || "",
      isLts: status.endsWith("LTS"),
      npm: latestVersion.dependencies.npm || "",
      v8: latestVersion.dependencies.v8,
      releaseDate: latestVersion.releaseDate,
      modules: latestVersion.modules.version || "",
      minorVersions,
    };
  });
};

async function getNpmDistTags(
  pkgName: string
): Promise<Record<string, string>> {
  const url = `https://registry.npmjs.org/${pkgName}`;
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Fetch failed for ${pkgName}: ${response.status}`);
  const data = (await response.json()) as Record<
    string,
    string | Record<string, string>
  >;
  return data["dist-tags"] as Record<string, string>;
}

async function getNpmDistTagsFallback(
  pkgName: string
): Promise<Record<string, string>> {
  try {
    const { stdout } = await $`npm view ${pkgName} dist-tags --json`.quiet();
    return JSON.parse(stdout.toString().trim());
  } catch {
    return {};
  }
}

async function getVersions(
  pkgName: string,
  tags: Array<string>
): Promise<Array<string>> {
  try {
    const tagsData = await getNpmDistTags(pkgName);
    return tags.map((tag) => tagsData[tag] || "").filter(Boolean);
  } catch {
    const tagsData = await getNpmDistTagsFallback(pkgName);
    return tags.map((tag) => tagsData[tag] || "").filter(Boolean);
  }
}

/**
 * This will detect, wether --bun or --node is requested
 */

async function getAlpineVersion(major: number) {
  try {
    const response = await fetch(
      `https://hub.docker.com/v2/repositories/library/node/tags/?page_size=100&name=${major}-alpine`
    );
    if (!response.ok) throw new Error("Failed to fetch tags");
    const data = await response.json() as any;
    // Find tags that match exactly ${major}-alpine3.x
    const tags = data.results
      .map((r: any) => r.name)
      .filter((name: string) => new RegExp(`^${major}-alpine3\\.\\d+$`).test(name));

    // Sort to find latest (e.g. alpine3.20 > alpine3.19)
    tags.sort((a: string, b: string) => {
      const verA = parseFloat(a.split("alpine")[1] || "0");
      const verB = parseFloat(b.split("alpine")[1] || "0");
      return verB - verA;
    });

    if (tags.length > 0 && tags[0]) {
      // Extract 3.20 from 20-alpine3.20
      return tags[0].split("alpine")[1] || "3.20";
    }
    return "3.20"; // Fallback
  } catch (e) {
    console.error("Error fetching Alpine version:", e);
    return "3.20"; // Fallback
  }
}

async function generateDockerfiles() {
  const releases = await generateReleaseData();
  const supportedMajors = releases
    .filter((r) => r && ["Current", "Active LTS", "Maintenance LTS"].includes(r.status))
    .map((r) => r?.major);

  // Find a source for docker-entrypoint.sh
  let entrypointSource = "";
  const glob = new Bun.Glob("**/docker-entrypoint.sh");
  for await (const file of glob.scan("src")) {
    entrypointSource = file;
    break;
  }

  if (!entrypointSource) {
    console.error("Could not find docker-entrypoint.sh to copy!");
    return;
  }
  const entrypointContent = await readFile(join("src", entrypointSource));

  for (const major of supportedMajors) {
    if (!major) continue;

    const alpineVer = await getAlpineVersion(major);
    console.log(`Generating for Node ${major} (Alpine ${alpineVer})`);

    // src/base
    const baseDir = join("src/base", major.toString());

    // Debian
    const debianDir = join(baseDir, "debian");
    await mkdir(debianDir, { recursive: true });
    await writeFile(join(debianDir, "dockerfile"), DEBIAN_TEMPLATE(major));
    await writeFile(join(debianDir, "docker-entrypoint.sh"), entrypointContent);
    await $`chmod +x ${join(debianDir, "docker-entrypoint.sh")}`;

    // Slim
    const slimDir = join(baseDir, "debian-slim");
    await mkdir(slimDir, { recursive: true });
    await writeFile(join(slimDir, "dockerfile"), SLIM_TEMPLATE(major));
    await writeFile(join(slimDir, "docker-entrypoint.sh"), entrypointContent);
    await $`chmod +x ${join(slimDir, "docker-entrypoint.sh")}`;

    // Alpine
    const alpineDir = join(baseDir, "alpine");
    await mkdir(alpineDir, { recursive: true });
    await writeFile(join(alpineDir, "dockerfile"), ALPINE_TEMPLATE(major, alpineVer));
    await writeFile(join(alpineDir, "docker-entrypoint.sh"), entrypointContent);
    await $`chmod +x ${join(alpineDir, "docker-entrypoint.sh")}`;

    // src/git
    const gitDir = join("src/git", major.toString(), "alpine");
    await mkdir(gitDir, { recursive: true });
    await writeFile(join(gitDir, "dockerfile"), GIT_ALPINE_TEMPLATE(major, alpineVer));
    await writeFile(join(gitDir, "docker-entrypoint.sh"), entrypointContent);
    await $`chmod +x ${join(gitDir, "docker-entrypoint.sh")}`;
  }
}

/**
 * Clean up unsupported Node.js version folders in src/base and src/git
 */
async function cleanup() {
  const releases = await generateReleaseData();
  const supportedMajors = releases
    .filter((r) => r && ["Current", "Active LTS", "Maintenance LTS"].includes(r.status))
    .map((r) => r?.major.toString());

  const dirsToClean = ["src/base", "src/git"];

  for (const dir of dirsToClean) {
    const absoluteDir = join(process.cwd(), dir);
    const glob = new Bun.Glob("*");
    for await (const folder of glob.scan({ cwd: absoluteDir, absolute: false, onlyFiles: false })) {
      if (!supportedMajors.includes(folder)) {
        const folderPath = join(absoluteDir, folder);
        try {
          const stats = await (await import("node:fs/promises")).stat(folderPath);
          if (stats.isDirectory()) {
            await rm(folderPath, { recursive: true, force: true });
          }
        } catch (e) {
          // Ignore errors (e.g., file does not exist)
        }
      }
    }
  }
}

/**
 * Generate Matrix for GitHub Actions
 */
async function generateMatrix() {
  const releases = (await generateReleaseData()).filter(Boolean);
  let versionsJson: any = {};
  try {
    versionsJson = await Bun.file("versions.json").json();
  } catch {
    // If file doesn't exist (first run), assume empty
  }

  const bunTagsToCheck = (process.env.BUN_TAGS_TO_CHECK || "canary,latest").split(",");
  const distros = (process.env.DISTROS || "alpine,debian-slim,debian").split(",");

  const matrix: any[] = [];

  // Get Bun versions
  const bunVersions: string[] = [];
  for (const tag of bunTagsToCheck) {
    const versions = await getVersions("bun", [tag]);
    bunVersions.push(...versions);
  }
  // Unique bun versions
  const uniqueBunVersions = [...new Set(bunVersions)];

  // Filter Node versions
  const nodeReleases = releases.filter((release) => [20, 22, 24, 25].includes(release?.major || 0));

  for (const bunVersion of uniqueBunVersions) {
    for (const release of nodeReleases) {
      if (!release) continue;

      const currentVersion = versionsJson.nodejs?.[release.major]?.version;
      const bunVersionClean = bunVersion.replace("v", "");
      const nodeVersionClean = release.versionWithPrefix.replace("v", "");

      // Check if we need to build
      // We build if:
      // 1. Node version is new (different from versions.json)
      // 2. Bun version is new (different from versions.json for that tag) - Wait, versions.json tracks ONE bun version per tag.
      // If we have multiple bun versions (e.g. canary updates), we should probably build all combinations if they are new?
      // For simplicity and matching previous logic:
      // We check if the specific combination needs update?
      // The previous logic was: if node updated, build all bun. If bun updated, build all node.

      // Let's simplify: We build everything that is "current" according to the inputs,
      // BUT we can filter if we want.
      // However, the requirement is "Make the version update of node automatic".
      // So if Node updates, we build.

      // Let's stick to the plan:
      // We need to know if we SHOULD build.
      // If versions.json is missing, build everything.
      // If versions.json exists:
      //   - Check if Node version is different.
      //   - Check if Bun version is different (we need to know which tag this bun version corresponds to, which is hard if we just have the version string).

      // Actually, the previous logic in build_updated.sh was:
      // IF NODE_VERSIONS_TO_BUILD is set, build those.
      // IF BUN_VERSIONS_TO_BUILD is set, build those.

      // So here, we should output the FULL matrix of what is CURRENTLY available,
      // AND let the workflow filter? Or filter here?
      // Filtering here is better.

      // But wait, if we use matrix, we want to output a list of jobs.
      // Each job needs: bun_version, node_version, distro.

      // Let's determine what changed.
      const isNodeChanged = currentVersion !== release.versionWithPrefix;

      // For Bun, we need to compare against the stored version for 'latest' or 'canary'.
      // This is tricky because we iterate over resolved versions.
      // Let's assume if the version string is different from what's in versions.json (values of bun object), it's new.
      const storedBunVersions = Object.values(versionsJson.bun || {});
      const isBunChanged = !storedBunVersions.includes(`v${bunVersionClean}`);

      if (isNodeChanged || isBunChanged) {
        for (const distro of distros) {
           matrix.push({
             bun_version: bunVersionClean,
             node_version: nodeVersionClean,
             distro: distro
           });
        }
      }
    }
  }

  console.log(JSON.stringify({ include: matrix }));
}

const main = async () => {
  if (process.argv.includes("--cleanup")) {
    await cleanup();
    if (process.argv.includes("--generate")) {
        await generateDockerfiles();
    }
    return;
  }

  if (process.argv.includes("--generate")) {
    await generateDockerfiles();
    return;
  }

  if (process.argv.includes("--matrix")) {
    await generateMatrix();
    return;
  }

  // ... existing logic for --bun and --node (keep for backward compatibility or remove if unused) ...
  if (process.argv.includes("--bun")) {
     // ... (keep existing)
     const arg = process.argv.find((a) => a.startsWith("--bun"))!;
     const tagsArg = arg.split("=")[1] ?? process.argv[process.argv.indexOf("--bun") + 1];
     const tags = (tagsArg || "latest").split(",");
     const versions = await getVersions("bun", tags);
     console.log(versions.join(","));
     return;
  }

  if (process.argv.includes("--node")) {
      // ... (keep existing)
      const releases = await generateReleaseData();
      const versionsJson = await Bun.file("versions.json").json();

      const newVersions = releases
        .filter((release) => [20, 22, 24, 25].includes(release?.major || 0))
        .filter((release) => {
          if (!release) return false;
          const currentVersion = versionsJson.nodejs[release.major]?.version;
          // If current version is not set, or is different (assuming we only get newer versions from nodevu), it's an update.
          // Actually, nodevu returns the LATEST version for that major.
          // So if versions.json has v20.10.0 and nodevu says v20.11.0, we want to build.
          // If versions.json has v20.11.0 and nodevu says v20.11.0, we don't want to build.
          return currentVersion !== release.versionWithPrefix;
        })
        .map((release) => release?.versionWithPrefix.replace("v", ""))
        .join(",");

      console.log(newVersions);
  }
};

await main();
