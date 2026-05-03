---
title: "TypeScript Type Debt Accumulation"
aliases: [type-debt, ts-debt, typescript-accumulation]
tags: [typescript, ci-cd, gotcha, workflow]
sources:
  - "daily/2026-05-03.md"
created: 2026-05-03
updated: 2026-05-03
---

# TypeScript Type Debt Accumulation

When multiple tasks are merged into a branch without each passing the TypeScript compiler check (CI green), type errors accumulate across files. Each subsequent fix can break something that was previously passing, creating an exponential fix loop where resolving one error surfaces two more.

## Key Points

- Root cause in Poputchiki: multiple tasks merged into `dev` without CI green → ~22+ TS errors accumulated
- The specific trigger: `HttpStatus` enum in `types/api.ts` coexisted with `HTTP_STATUS` plain object in `constants/http.ts`; code mixed both
- Fix: unify on single source of truth (`HttpStatus` enum), delete `HTTP_STATUS` const, update all consumers
- Required ~15 commits to fully resolve, including `skipLibCheck` for `@types/bun` / `@types/node` workspace conflicts
- Each parallel workspace (api, notifier, cron, webhook, web) needs independent tsconfig routing

## Details

The accumulation pattern: task A introduces type X, task B introduces type Y that conflicts with X, task C uses both. When CI is only checked at merge rather than per-task, the merge of task C is when the conflict first surfaces. At that point, fixing C requires understanding A and B's types simultaneously. With 10+ tasks accumulated, the surface area becomes very large.

In the specific case of `HttpStatus` vs `HTTP_STATUS`: the enum was defined in `packages/shared/src/types/api.ts` and the plain-object constant in `packages/shared/src/constants/http.ts`. Both were re-exported from `packages/shared/src/index.ts`. Code throughout the monorepo used whichever form was imported locally, creating a mixed usage pattern that broke when either was removed or modified.

Additional friction: `@types/bun` and `@types/node` in the same workspace conflict because both declare global Node.js types. The resolution is `skipLibCheck: true` in tsconfig, or explicitly excluding one via `types` array in tsconfig `compilerOptions`.

## Related Concepts

- [[concepts/ci-parallel-jobs]] - Parallel CI reveals type errors without sequential masking
- [[concepts/tasks-json-management]] - CI gate must be green before task marked done
- [[concepts/poputchiki-stack]] - Bun monorepo workspace structure where this occurred

## Sources

- [[daily/2026-05-03.md]] - ~22 TS errors fixed across ~15 commits; HttpStatus enum unified; skipLibCheck added; root cause: tasks merged without CI gate
