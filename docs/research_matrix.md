# Research: Workflow Matrix vs Single Builder (issue #24)

## Context

The old build system used a "single builder": one job running `build_updated.sh` which
looped over every Bun × Node × distro combination sequentially, building and pushing
images one after the other. Issue #24 asked whether a GitHub Actions matrix strategy
would be better.

## Comparison

| Feature | Single Builder (old) | Workflow Matrix (new) |
| :--- | :--- | :--- |
| Parallelism | Sequential loop | Concurrent jobs (max 12) |
| Failure isolation | One bad combo retries the whole run | Per-combo retry, others keep going |
| Total wall time | ~2h for a full release | ~20–30 min for a full release |
| Logs | One giant log | One clean log per combo |
| Retry cost | `nick-fields/retry` around the whole loop | Per-combo retry, `fail-fast: false` |
| Dynamic inputs | Bash string gymnastics | Native dynamic matrix (`fromJson`) |
| `latest` tag ordering | Pushed mid-loop (bug #38) | Re-pointed in a finalize job after all builds succeed |

## Downsides of the matrix and how we mitigate them

1. **Docker Hub push rate limits / tag ordering.** Pushing 12 combos in parallel is
   fine within Hub's limits, and the flat `latest` tag is only created by the
   `finalize` job (via `docker buildx imagetools create`) **after every build job
   succeeded**, so it is always the newest tag, exactly as requested in #38.
2. **Dynamic matrix needs a setup job.** `check-bun-node.ts --matrix` resolves the
   current Bun/Node versions and emits the JSON matrix. Setup runs `--sync` first so
   new Node majors get Dockerfiles before their matrix entries are generated.
3. **Shared state.** The old script mutated `versions.json` mid-run. Now each build
   job emits `build_success.json`; the `finalize` job merges them and uploads the
   result to the GitHub Release (issue #35), and reports only what actually changed
   (issue #31).

## Conclusion

**Matrix wins.** Build time drops from ~2h to ~30min, failures are isolated, and the
`latest` tag semantics become deterministic. The extra complexity is contained in the
`setup`/`finalize` jobs.
