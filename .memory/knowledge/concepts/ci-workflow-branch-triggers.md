---
title: "CI Workflow Branch Triggers — Only dev and main"
aliases: [ci-branch-triggers, workflow-triggers, feature-branch-ci]
tags: [ci-cd, workflow, gotcha, github-actions]
sources:
  - "daily/2026-05-08.md"
created: 2026-05-08
updated: 2026-05-13
---

# CI Workflow Branch Triggers — Only dev and main

The Poputchiki CI workflow (`ci.yml`) is configured to trigger only on `dev` and `main` branches. Feature branches, fix branches, and merge branches do not trigger CI. CI results are only available after squash-merging into `dev`.

## Key Points

- `ci.yml` triggers: `branches: [dev, main]` — no wildcard, no `feat/*` pattern
- Feature branches (`feat/*`, `fix/*`, `merge/*`) do NOT trigger CI automatically
- "CI red" always refers to `dev` or `main` — feature branches have no CI status to check
- Consequence: all validation happens at merge time, not during feature development
- Always check workflow trigger config before working in a feature branch expecting CI feedback

## Details

During the 2026-05-08 session, a `fix` branch was created from `main` for security hardening work. Multiple commits landed in the branch. The CI pipeline never triggered. Only when the branch was squash-merged into `dev` did CI run and validate all security fixes. The delay between writing code and CI feedback was the entire time spent in the feature branch.

This workflow design is intentional: the autonomous agent works in `dev` directly for small fixes, or creates feature branches for larger work, always squashing to `dev` before CI validation. The tradeoff is that type errors, lint violations, and test failures are only caught at merge time. Local `bun run typecheck` and `bun run lint` are the only pre-merge gates available during feature branch work.

The same applies to Dependabot PRs: their default target is `main`, but direct pushes to `main` are blocked. Dependabot changes must be cherry-picked to `dev`, at which point CI triggers immediately on `dev` after the push.

Understanding this trigger scope is critical when debugging "why CI isn't running" — the answer is almost always that the current branch is not `dev` or `main`.

## Related Concepts

- [[concepts/ci-parallel-jobs]] - The 8-job parallel pipeline that runs when CI triggers on dev/main
- [[concepts/bun-lockfile-frozen-ci]] - Lockfile issues surface at first push to dev, not during feature branch work — trigger scope explains the delay

## Sources

- [[daily/2026-05-08.md]] - Session 12:33: CI on `fix` branch never triggered — workflow triggers only on `dev`/`main`; squash to dev chosen for CI validation; memory flush 18:10 confirmed: "CI workflow запускается ТОЛЬКО на `dev`/`main` — на `merge/*` ветках CI не идёт"
