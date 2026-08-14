export default {
  type: "worker",
  name: "bun-node-stats",
  entrypoint: "src/index.ts",
  compatibilityDate: "2026-01-01",
  compatibilityFlags: ["nodejs_compat"],
  workersDev: false,
  triggers: [{ type: "scheduled", schedule: "0 0 * * *" }],
  env: {
    STATS_KV: { type: "kv", id: "d7b7957fdc5648628bfb61baddff65ec" },
    GITHUB_REPO: { type: "text", value: "ImBIOS/bun-node" },
    DOCKER_REPO: { type: "text", value: "imbios/bun-node" },
    PRIVATE_KEY: { type: "secret" },
    SEED_KEY: { type: "secret" },

  },
};
