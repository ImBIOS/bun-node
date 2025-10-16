// @ts-expect-error - no types
import nodevu from "@nodevu/core";
import { JSDOM } from "jsdom";

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

async function getNpmVersions(pkgName: string) {
  const url = `https://www.npmjs.com/package/${pkgName}?activeTab=versions`;
  const res = await fetch(url);
  const html = await res.text();
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const rows = Array.from(doc.querySelectorAll("table tbody tr"));

  const latestVersions = { latest: "", canary: "" };

  for (const row of rows) {
    const versionEl = row.querySelector(
      'a[class="_132722c7 f5 black-60 lh-copy code"]'
    );
    const tagEl = row.querySelector('td[class="ccbecba3 f5 black-60 lh-copy"]');

    if (!versionEl || !tagEl) continue;

    const version = versionEl.textContent.trim();
    const tag = tagEl.textContent.trim().toLowerCase();

    if (tag === "latest") latestVersions.latest = version;
    if (tag === "canary") latestVersions.canary = version;

    // Stop early if both found
    if (latestVersions.latest && latestVersions.canary) break;
  }

  return [latestVersions.latest, latestVersions.canary];
}

/**
 * This will detect, wether --bun or --node is requested
 */
if (process.argv.includes("--bun")) {
  getNpmVersions("bun").then((versions) => {
    console.log(versions.join(","));
  });
} else if (process.argv.includes("--node")) {
  console.log(
    (await generateReleaseData())
      .filter((release) => [20, 22, 24, 25].includes(release?.major || 0))
      .map((release) => release?.versionWithPrefix.replace("v", ""))
      .join(",")
  );
}
