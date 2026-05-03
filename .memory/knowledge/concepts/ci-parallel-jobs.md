---
title: "CI Parallel Jobs Architecture (8-Job Pipeline)"
aliases: [parallel-ci, ci-jobs, github-actions-parallel]
tags: [ci-cd, testing, workflow, github-actions]
sources:
  - "daily/2026-05-03.md"
created: 2026-05-03
updated: 2026-05-03
---

# CI Parallel Jobs Architecture (8-Job Pipeline)

The Poputchiki CI pipeline was rewritten from sequential steps to 8 truly parallel GitHub Actions jobs. Sequential CI hides failures — if step 3 fails, steps 4–8 never run, so a single push can reveal only one failure at a time, creating a fix→push→repeat loop.

## Key Points

- 8 parallel jobs: `lint`, `typecheck`, `unit`, `integration`, `security`, `web`, `audit`, `gitleaks`
- A `ci-summary` aggregator job runs after all 8 and reports combined status
- Sequential CI with `continue-on-error` is NOT equivalent — it runs in one job, can share state, and GitHub UI treats it as one result
- Coverage thresholds: integration = 95/90/95/95, unit = 95/95/95/95 (line/branch/function/statement)
- Each parallel job installs Bun and dependencies independently — overhead tradeoff for isolation

## Details

The original CI ran steps sequentially within a single job. When a step failed, GitHub Actions stopped execution (or continued with degraded state via `continue-on-error`). This meant a developer could spend multiple push→fail→fix cycles working through failures one at a time, never seeing the full picture.

True parallel jobs in GitHub Actions are separate workflow jobs with their own runner allocations. All 8 start simultaneously, fail independently, and report independently. A developer can see all failures from a single push run and batch-fix them in one commit. The `ci-summary` job uses `needs: [lint, typecheck, unit, ...]` with `if: always()` to aggregate results after all parallel jobs complete.

The rewrite also introduced `c8 ignore` strategy for technically untestable code: fire-and-forget `.catch()` handlers, defensive nullish checks for library-guaranteed types, and misconfig branches. These are annotated with `/* c8 ignore next */` rather than excluded from coverage thresholds, preserving the 95% gate.

Gitleaks v8 uses `paths` as regex patterns, not globs — `*.md` panics; the correct form is triple-quoted `'''.*\.md'''`.

## Related Concepts

- [[concepts/deployment-pipeline]] - CI gates govern what reaches production
- [[concepts/tasks-json-management]] - Each task must pass CI before marking done
- [[concepts/typescript-type-debt]] - Type debt accumulates when CI is not enforced per-task

## Sources

- [[daily/2026-05-03.md]] - CI rewritten from sequential to 8 parallel jobs; c8 ignore strategy; coverage thresholds set; gitleaks regex vs glob discovery; squashed 10 fix-commits into bbac8e8
