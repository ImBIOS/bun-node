#!/usr/bin/env bun
/**
 * Version coordinator for bun-node images.
 *
 * Usage:
 *   bun check-bun-node.ts --bun latest,canary
 *   bun check-bun-node.ts --node [--majors 22,24] [--versions versions.json]
 *   bun check-bun-node.ts --matrix [--majors 22,24] [--versions versions.json]
 *   bun check-bun-node.ts --sync [--versions versions.json]
 */

// @ts-expect-error - no types
import nodevu from "@nodevu/core";
import { $ } from "bun";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const nodevuData = await nodevu({ fetch });

const nodevuDataTyped = nodevuData as Record<
  string,
  {
    releases: Record<
      string,
      {
        modules: { version: string };
        dependencies: { npm: string; v8: string };
        semver: { major: number; minor: number; patch: number; raw: string };
        releaseDate: string;
      }
    >;
    support: {
      phases: {
        dates: { start: string; lts: string; maintenance: string; end: string };
      };
      codename: string;
    };
  }
>;

interface NodeRelease {
  major: number;
  version: string;
  versionWithPrefix: string;
  codename: string;
  status: string;
}

interface VersionsState {
  bun: Record<string, string>;
  nodejs: Record<string, { name: string; version: string }>;
  _needs_rebuild?: string[];
}

const STATUS_KEPT = ["Current", "Active LTS", "Maintenance LTS"];

function getNodeReleaseStatus(
  now: Date,
  support: { endOfLife: string; maintenanceStart: string; ltsStart: string; currentStart: string }
): string {
  const { endOfLife, maintenanceStart, ltsStart, currentStart } = support;

  if (endOfLife && now >= new Date(endOfLife)) return "End-of-life";
  if (maintenanceStart && now >= new Date(maintenanceStart)) return "Maintenance LTS";
  if (ltsStart && now >= new Date(ltsStart)) return "Active LTS";
  if (currentStart && now >= new Date(currentStart)) return "Current";
  return "Pending";
}

function getMajorNodeReleases() {
  return Object.entries(nodevuDataTyped).filter(([version, { support }]) => {
    if (!support) return false;
    if (version.startsWith("v0.") && version !== "v0.12") return false;
    return true;
  });
}

async function generateReleaseData(): Promise<NodeRelease[]> {
  const majors = getMajorNodeReleases();
  const releases: NodeRelease[] = [];

  for (const [, major] of majors) {
    const versions = Object.values(major.releases);
    if (versions.length === 0) continue;

    const latestVersion = versions.reduce((newest, release) =>
      compareVersions(release.semver.raw, newest.semver.raw) > 0 ? release : newest
    );

    const status = getNodeReleaseStatus(new Date(), {
      currentStart: major.support.phases.dates.start,
      ltsStart: major.support.phases.dates.lts,
      maintenanceStart: major.support.phases.dates.maintenance,
      endOfLife: major.support.phases.dates.end,
    });

    releases.push({
      major: latestVersion.semver.major,
      version: latestVersion.semver.raw,
      versionWithPrefix: `v${latestVersion.semver.raw}`,
      codename: (major.support.codename || "").toLowerCase(),
      status,
    });
  }

  return releases.sort((a, b) => a.major - b.major);
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number(n));
  const pb = b.split(".").map((n) => Number(n));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function supportedMajors(releases: NodeRelease[]): NodeRelease[] {
  return releases.filter((r) => STATUS_KEPT.includes(r.status));
}

async function getNpmDistTags(pkgName: string): Promise<Record<string, string>> {
  const url = `https://registry.npmjs.org/${pkgName}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fetch failed for ${pkgName}: ${response.status}`);
  const data = (await response.json()) as Record<string, string | Record<string, string>>;
  return data["dist-tags"] as Record<string, string>;
}

async function getNpmDistTagsFallback(pkgName: string): Promise<Record<string, string>> {
  try {
    const { stdout } = await $`npm view ${pkgName} dist-tags --json`.quiet();
    return JSON.parse(stdout.toString().trim());
  } catch {
    return {};
  }
}

async function getVersions(pkgName: string, tags: Array<string>): Promise<Array<string>> {
  try {
    const tagsData = await getNpmDistTags(pkgName);
    return tags.map((tag) => tagsData[tag] || "").filter(Boolean);
  } catch {
    const tagsData = await getNpmDistTagsFallback(pkgName);
    return tags.map((tag) => tagsData[tag] || "").filter(Boolean);
  }
}

async function loadVersionsState(path: string): Promise<VersionsState> {
  try {
    const parsed = (await Bun.file(path).json()) as Partial<VersionsState>;
    return { bun: parsed.bun || {}, nodejs: parsed.nodejs || {}, _needs_rebuild: parsed._needs_rebuild };
  } catch {
    return { bun: {}, nodejs: {} };
  }
}

function versionsFilePath(): string {
  const flagIndex = process.argv.indexOf("--versions");
  if (flagIndex !== -1 && process.argv[flagIndex + 1]) {
    return process.argv[flagIndex + 1]!;
  }
  return process.env.VERSIONS_FILE || "versions.json";
}

function flagValue(flag: string, fallback: string): string {
  const arg = process.argv.find((a) => a.startsWith(flag));
  if (!arg) return fallback;
  const value = arg.split("=")[1];
  if (value) return value;
  const index = process.argv.indexOf(arg);
  return process.argv[index + 1] || fallback;
}

function majorsArg(): number[] {
  const value = flagValue("--majors", process.env.NODE_MAJOR_VERSIONS_TO_CHECK || "");
  return value.split(",").map((m) => Number(m)).filter((m) => !Number.isNaN(m));
}

const alpineCache = new Map<number, string>();
const bookwormCache = new Map<number, boolean>();

async function getDockerNodeTag(major: number, pattern: RegExp): Promise<string | null> {
  const names: string[] = [];
  let next = `https://hub.docker.com/v2/repositories/library/node/tags/?page_size=100&name=${major}-`;
  while (next) {
    const response = await fetch(next);
    if (!response.ok) return null;
    const data = (await response.json()) as { results: Array<{ name: string }>; next: string | null };
    for (const result of data.results) names.push(result.name);
    next = data.next || "";
  }
  const matches = names.filter((name) => pattern.test(name));
  if (matches.length === 0) return null;
  matches.sort((a, b) => {
    const pa = (a.split("alpine")[1] || "0").split(".").map((n) => Number(n));
    const pb = (b.split("alpine")[1] || "0").split(".").map((n) => Number(n));
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const diff = (pb[i] || 0) - (pa[i] || 0);
      if (diff !== 0) return diff;
    }
    return 0;
  });
  return matches[0] || null;
}

async function getAlpineVersion(major: number): Promise<string | null> {
  if (!alpineCache.has(major)) {
    const tag = await getDockerNodeTag(major, new RegExp(`^${major}-alpine3\\.\\d+$`));
    alpineCache.set(major, tag ? (tag.split("alpine")[1] as string) : "");
  }
  return alpineCache.get(major) || null;
}

async function hasBookworm(major: number): Promise<boolean> {
  if (!bookwormCache.has(major)) {
    const tag = await getDockerNodeTag(major, new RegExp(`^${major}-bookworm$`));
    bookwormCache.set(major, tag !== null);
  }
  return bookwormCache.get(major) || false;
}

function argOrEnv(flag: string, envName: string, fallback: string): string {
  const arg = process.argv.find((a) => a.startsWith(flag));
  if (arg) return flagValue(flag, fallback);
  return process.env[envName] || fallback;
}

async function resolveSupportedMajors(): Promise<Array<{ major: number; alpine: string }>> {
  const releases = supportedMajors(await generateReleaseData());
  const supported: Array<{ major: number; alpine: string }> = [];
  for (const release of releases) {
    const [alpine, bookworm] = await Promise.all([
      getAlpineVersion(release.major),
      hasBookworm(release.major),
    ]);
    if (!alpine || !bookworm) {
      console.error(
        `skip node ${release.major}: docker-node tags unavailable (alpine=${alpine}, bookworm=${bookworm})`
      );
      continue;
    }
    supported.push({ major: release.major, alpine });
  }
  return supported;
}

async function readTemplates(): Promise<Map<string, string>> {
  const templates = new Map<string, string>();
  for (const name of [
    "debian.dockerfile",
    "debian-slim.dockerfile",
    "alpine.dockerfile",
    "alpine-git.dockerfile",
  ]) {
    templates.set(name, await readFile(join("templates", name), "utf8"));
  }
  return templates;
}

async function syncDockerfiles(): Promise<{ created: number[]; updated: number[]; removed: number[] }> {
  const supported = await resolveSupportedMajors();
  const created: number[] = [];
  const updated: number[] = [];

  const templates = await readTemplates();
  const entrypoint = await readFile(join("templates", "docker-entrypoint.sh"), "utf8");

  const render = (template: string, major: number, alpine: string) =>
    template
      .replaceAll("__NODE_MAJOR__", String(major))
      .replaceAll("__ALPINE_VERSION__", alpine);

  const targets = (major: number): Array<{ dir: string; template: string }> => [
    { dir: `src/base/${major}/debian`, template: "debian.dockerfile" },
    { dir: `src/base/${major}/debian-slim`, template: "debian-slim.dockerfile" },
    { dir: `src/base/${major}/alpine`, template: "alpine.dockerfile" },
    { dir: `src/git/${major}/alpine`, template: "alpine-git.dockerfile" },
  ];

  const ensureDir = async (dir: string, template: string, major: number, alpine: string, isNew: boolean) => {
    await mkdir(dir, { recursive: true });
    const content = render(templates.get(template)!, major, alpine);
    let existing: string | null = null;
    try {
      existing = await readFile(join(dir, "dockerfile"), "utf8");
    } catch {}

    if (existing !== content) {
      await writeFile(join(dir, "dockerfile"), content);
      track(major, isNew ? created : updated);
    }

    let existingEntrypoint: string | null = null;
    try {
      existingEntrypoint = await readFile(join(dir, "docker-entrypoint.sh"), "utf8");
    } catch {}

    if (existingEntrypoint !== entrypoint) {
      await writeFile(join(dir, "docker-entrypoint.sh"), entrypoint);
      await $`chmod +x ${join(dir, "docker-entrypoint.sh")}`;
    }
  };

  const track = (major: number, list: number[]) => {
    if (Number.isNaN(major) || list.includes(major)) return;
    list.push(major);
  };

  for (const { major, alpine } of supported) {
    for (const { dir, template } of targets(major)) {
      let isNew = false;
      try {
        await readFile(join(dir, "dockerfile"));
      } catch {
        isNew = true;
      }
      await ensureDir(dir, template, major, alpine, isNew);
    }
  }

  const removed: number[] = [];
  if (supported.length > 0) {
    for (const root of ["src/base", "src/git"]) {
      const absoluteDir = join(process.cwd(), root);
      const entries = await readdir(absoluteDir, { withFileTypes: true }).catch(() => []);
      for (const dirent of entries) {
        if (!dirent.isDirectory()) continue;
        if (supported.some((s) => String(s.major) === dirent.name)) continue;
        await rm(join(absoluteDir, dirent.name), { recursive: true, force: true });
        track(Number(dirent.name), removed);
      }
    }
  }

  console.log(
    JSON.stringify({
      created,
      updated,
      removed,
      message:
        created.length > 0
          ? `added node majors: ${created.join(", ")}`
          : updated.length > 0
            ? `refreshed dockerfiles for majors: ${updated.join(", ")}`
            : removed.length > 0
              ? `removed EOL node majors: ${removed.join(", ")}`
              : "nothing to change",
    })
  );

  if (created.length > 0 || updated.length > 0) {
    const state = await loadVersionsState(versionsFilePath());
    const rebuild = new Set<string>(state._needs_rebuild || []);
    for (const major of [...created, ...updated]) rebuild.add(String(major));
    state._needs_rebuild = [...rebuild];
    await writeFile(versionsFilePath(), JSON.stringify(state, null, 2) + "\n");
  }

  return { created, updated, removed };
}

async function generateMatrix(): Promise<void> {
  const releases = await generateReleaseData();
  const state = await loadVersionsState(versionsFilePath());

  const supportedMajorsList = await resolveSupportedMajors();
  const explicitMajors = majorsArg();
  const majors = explicitMajors.length > 0 ? explicitMajors : supportedMajorsList.map((s) => s.major);
  const availableReleases = releases.filter(
    (r) => majors.includes(r.major) && supportedMajorsList.some((s) => s.major === r.major)
  );
  const distros = argOrEnv("--distros", "DISTROS", "alpine,debian-slim,debian")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);

  const bunTags = argOrEnv("--bun", "BUN_TAGS_TO_CHECK", "canary,latest")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const include: Array<Record<string, string | number>> = [];
  const forcedBun = process.env.INPUT_BUN_VERSIONS || "";
  const forcedNode = process.env.INPUT_NODE_VERSIONS || "";

  if (forcedBun || forcedNode) {
    const bunVersions = forcedBun
      ? forcedBun.split(",").map((v) => v.trim()).filter(Boolean)
      : (await Promise.all(bunTags.map((t) => getVersions("bun", [t])))).flat();
    const forcedNodeVersions = forcedNode
      ? forcedNode.split(",").map((v) => v.trim()).filter(Boolean)
      : [];
    const releaseByVersion = new Map(releases.map((r) => [r.version, r]));

    for (const bunVersion of bunVersions) {
      const isCanary = bunVersion.includes("-canary");
      const tag = isCanary ? "canary" : "latest";
      const nodeVersions = forcedNodeVersions.length > 0 ? forcedNodeVersions : availableReleases.map((r) => r.version);
      for (const nodeVersion of nodeVersions) {
        const release = releaseByVersion.get(nodeVersion);
        for (const distro of distros) {
          include.push({
            bun_tag: tag,
            bun_version: bunVersion.replace(/^v/, ""),
            node_major: Number(nodeVersion.split(".")[0]),
            node_version: nodeVersion,
            codename: release?.codename || "",
            distro,
            latest_candidate: false,
          });
        }
      }
    }
  } else {
    for (const tag of bunTags) {
      const [version] = await getVersions("bun", [tag]);
      if (!version) {
        console.error(`no npm dist-tag ${tag} for bun`);
        continue;
      }
      const stored = state.bun[tag];
      const bunChanged = stored !== `v${version}`;
      const maxMajor = Math.max(...availableReleases.map((r) => r.major), 0);

      for (const release of availableReleases) {
        const storedNode = state.nodejs[String(release.major)]?.version;
        const nodeChanged = storedNode !== release.versionWithPrefix;
        const forceRebuild = (state._needs_rebuild || []).includes(String(release.major));

        if (!bunChanged && !nodeChanged && !forceRebuild) continue;

        for (const distro of distros) {
          include.push({
            bun_tag: tag,
            bun_version: version.replace(/^v/, ""),
            node_major: release.major,
            node_version: release.version,
            codename: release.codename,
            distro,
            latest_candidate: release.major === maxMajor && distro === "debian" && tag === "latest",
          });
        }
      }
    }
  }

  console.log(JSON.stringify({ include }));
}

async function main(): Promise<void> {
  if (process.argv.includes("--sync")) {
    await syncDockerfiles();
    return;
  }

  if (process.argv.includes("--matrix")) {
    await generateMatrix();
    return;
  }

  if (process.argv.includes("--bun")) {
    const tags = flagValue("--bun", "latest").split(",");
    const versions = await getVersions("bun", tags);
    console.log(versions.join(","));
    return;
  }

  if (process.argv.includes("--node")) {
    const releases = supportedMajors(await generateReleaseData());
    const filter = majorsArg();
    const state = await loadVersionsState(versionsFilePath());
    const changed = releases
      .filter((r) => filter.length === 0 || filter.includes(r.major))
      .filter((r) => state.nodejs[String(r.major)]?.version !== r.versionWithPrefix)
      .map((r) => r.version);
    console.log(changed.join(","));
  }
}

await main();
