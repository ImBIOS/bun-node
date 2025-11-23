# Research: Workflow Matrix vs Single Builder

## Context
The current build system uses a "Single Builder" pattern where a single job runs a script (`build_updated.sh`) that iterates over all versions and builds them sequentially. Issue #24 suggests investigating if a GitHub Actions Matrix strategy would be better.

## Comparison

| Feature | Single Builder (Current) | Workflow Matrix |
| :--- | :--- | :--- |
| **Parallelism** | Low (Sequential builds in loop) | High (Concurrent jobs) |
| **Failures** | One failure can stop the whole loop (unless handled carefully) | Isolated failures per job |
| **Resource Usage** | Single runner, longer duration | Multiple runners, shorter duration (burst) |
| **Complexity** | High (Bash script logic) | Medium (YAML configuration) |
| **Cost** | Lower (1 runner time) | Higher (Multiple runners init time overhead) |
| **Logs** | Mixed in one huge log | Separated per job |
| **Dynamic** | Hard (Need to generate JSON for matrix) | Native support for dynamic matrix |

## Analysis for bun-node

### Pros of Matrix
1.  **Speed:** Building multiple Docker images is time-consuming. Parallelizing this would significantly reduce total build time.
2.  **Isolation:** If one image build fails (e.g., specific Node version issue), it won't block others.
3.  **Clarity:** GitHub UI shows exactly which build failed.

### Cons of Matrix
1.  **Complexity of Dynamic Matrix:** Since we only want to build *updated* versions, we need a "setup" job that calculates the matrix (JSON) and passes it to the build job.
2.  **Concurrency Limits:** GitHub Free tier has concurrency limits (20 jobs). If we have many versions, we might queue.
3.  **Shared State:** The current script updates `versions.json` after each build. In a matrix, we'd need to aggregate these updates or handle them differently (e.g., one final commit job).

## Recommendation
**Migrate to Matrix.**
The benefits of parallelism and isolation outweigh the setup complexity.
The `versions.json` update issue (Issue 35) actually helps here: if we move `versions.json` to Releases, we don't need to commit to git from every job. We can have a final "Release" job that aggregates the successful builds and updates the `versions.json` in the Release assets.

## Implementation Strategy
1.  **Job 1: Check Versions**
    - Runs `check-bun-node.ts`.
    - Outputs a JSON matrix of versions to build.
2.  **Job 2: Build (Matrix)**
    - `needs: [check-versions]`
    - `strategy: matrix: ${{ fromJson(needs.check-versions.outputs.matrix) }}`
    - Builds and pushes single image.
3.  **Job 3: Update Release**
    - `needs: [build]`
    - Updates `versions.json` and uploads to GitHub Release.
