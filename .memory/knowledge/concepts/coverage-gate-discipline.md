---
title: "Coverage Gate Discipline (Never Lower Thresholds)"
aliases: [coverage-discipline, coverage-gate, threshold-rollback]
tags: [testing, ci-cd, discipline, coverage]
sources:
  - "daily/2026-05-03.md"
created: 2026-05-03
updated: 2026-05-03
---

# Coverage Gate Discipline (Never Lower Thresholds)

Lowering a coverage threshold to make CI pass is a regressive move. It permanently degrades the quality bar, masks untested code paths, and normalizes the pattern of shipping undertested features. Write tests or don't merge.

## Key Points

- In the 2026-05-03 session, integration coverage threshold was dropped from 95% to 55% to make CI green — immediately caught and reversed
- The correct response to a coverage failure: write the missing tests, not lower the threshold
- Exception: `c8 ignore` annotations on technically untestable code (fire-and-forget `.catch`, defensive nullish for library-guaranteed types) — these are annotated inline, not threshold changes
- Coverage thresholds: integration = 95/90/95/95, unit = 95/95/95/95 (line/branch/function/statement)
- Adding a CI coverage gate without backing integration tests = self-created blocker; write tests first

## Details

The failure mode is subtle: a developer encounters a red CI coverage gate, reasons that "95% is too strict for this module," and lowers the threshold. The CI turns green. The underlying untested code paths remain. Future regressions in those paths are invisible until production.

A correct alternative is the `c8 ignore` strategy: for code that is structurally unreachable in tests (not logically unreachable — that indicates a design problem), add `/* c8 ignore next */` inline. This keeps the threshold intact while acknowledging the specific line. Examples of legitimate ignores: `.catch(/* c8 ignore next */ () => {})` for fire-and-forget error handlers, nullish guards for types that the library guarantees are non-null (e.g., postgres.js always returns `Date` for `timestamptz`).

Defensive ternary branches for library-guaranteed types are considered dead code, not untestable code — they should be removed rather than annotated. The presence of an unreachable branch signals a misunderstanding of the library's contract and should be fixed at the source.

## Related Concepts

- [[concepts/ci-parallel-jobs]] - Coverage gates run as part of the parallel CI pipeline
- [[concepts/scope-creep-sentinel]] - Scope creep often surfaces when trying to make coverage pass
- [[concepts/tasks-json-management]] - Task acceptance requires green CI including coverage gate
- [[concepts/c8-ignore-denominator-oscillation]] - Pitfall when using c8 ignore to fix coverage: adding blocks changes denominators for both functions and branches, causing oscillation between the two metrics

## Sources

- [[daily/2026-05-03.md]] - Threshold dropped 95%→55% to pass CI; immediately caught and reversed; c8 ignore strategy documented; defensive ternary for postgres.js-guaranteed types = dead code, remove not annotate
