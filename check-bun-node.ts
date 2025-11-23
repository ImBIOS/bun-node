#!/usr/bin/env bun
/**
 * Usage:
 *   bun check-bun-node.ts --bun canary,latest
 *   bun check-bun-node.ts --node 20,22,24,25
 */

// @ts-expect-error - no types
import nodevu from "@nodevu/core";
import { $ } from "bun";

const nodevuData = await nodevu({ fetch });

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
const main = async () => {
  if (process.argv.includes("--bun")) {
    const arg = process.argv.find((a) => a.startsWith("--bun"))!;
    const tagsArg =
      arg.split("=")[1] ?? process.argv[process.argv.indexOf("--bun") + 1];
    const tags = (tagsArg || "latest").split(",");
    const versions = await getVersions("bun", tags);
    console.log(versions.join(","));
    return;
  }

  if (process.argv.includes("--node")) {
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
