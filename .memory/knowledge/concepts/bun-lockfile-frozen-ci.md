---
title: "Bun Lockfile Frozen CI — bun.lock Must Be Committed"
aliases: [bun-lockfile, frozen-lockfile, bun-lock-ci]
tags: [bun, ci-cd, gotcha, dependency-management]
sources:
  - "daily/2026-05-08.md"
created: 2026-05-08
updated: 2026-05-13
---

# Bun Lockfile Frozen CI — bun.lock Must Be Committed

When a dependency version changes in `package.json` (manually or via Dependabot), `bun.lock` must be regenerated and committed in the same commit. CI runs `bun install --frozen-lockfile`, which fails if the lockfile is stale or missing updates.

## Key Points

- `bun install --frozen-lockfile` in CI fails if `bun.lock` doesn't match `package.json`
- Root cause: commit `0b9622a` bumped jsdom 25→29 in `package.json` without running `bun install` to update lockfile
- Fix: always run `bun install` locally after any `package.json` change and commit the resulting `bun.lock`
- When squash-merging branches with different `package.json`: regenerate lockfile after resolving conflicts
- Stale lockfile produces CI fail before any tests run — all 8 parallel jobs fail at install step

## Details

The lockfile freeze mechanism ensures reproducible installs across environments. When a developer (or automated tool like Dependabot) updates a version in `package.json`, the lockfile becomes stale. On the next CI run, `bun install --frozen-lockfile` detects the mismatch and fails with a non-zero exit code before any tests run.

This failure mode is common in three scenarios: (1) version bumps made directly to `package.json` without running `bun install`; (2) two branches with different dependencies are squash-merged — the merged `package.json` may combine changes from both, but neither branch's lockfile reflects the combination; (3) Dependabot PRs that update `package.json` may conflict with manually applied version bumps in the target branch.

The fix is always the same: after any `package.json` change (including resolving merge conflicts in it), run `bun install` locally, verify no unexpected dependency changes appeared, and commit `bun.lock` alongside the `package.json` change. In the squash-merge case, regenerate lockfile fresh after resolving all conflicts before committing.

## Related Concepts

- [[concepts/ci-parallel-jobs]] - CI pipeline where frozen lockfile check runs; all 8 jobs fail at install step when lockfile is stale
- [[concepts/ci-workflow-branch-triggers]] - CI only triggers on dev/main; lockfile issues are caught at the first push to dev, not during feature branch development

## Sources

- [[daily/2026-05-08.md]] - Memory flush 18:10: CI red after squash merge of feat/design-v2; root cause `bun.lock` stale (jsdom 25→29 in package.json without lockfile update, vitest 4.1.5 also not locked); fix: `bun install` + commit lockfile before push
