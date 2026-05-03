---
title: "c8 Ignore Denominator Oscillation (Functions vs Branches)"
aliases: [c8-oscillation, coverage-oscillation, c8-ignore-side-effects]
tags: [testing, coverage, c8, gotcha]
sources:
  - "daily/2026-05-03.md"
created: 2026-05-03
updated: 2026-05-03
---

# c8 Ignore Denominator Oscillation (Functions vs Branches)

`c8 ignore start/stop` blocks and `c8 ignore next` directives change the denominator for both the function count and the branch count independently. Adding a block to fix one metric can shrink the denominator in a way that pushes the other metric below threshold, creating an oscillation loop where fixing functions breaks branches and vice versa.

## Key Points

- **Critical**: `/* c8 ignore start/stop */` does NOT exclude function definitions from V8 function coverage — only statements and branches are excluded; function count denominator is unaffected
- To exclude a function from V8 function coverage, `/* c8 ignore next */` must appear on a **separate line** immediately before the arrow function declaration (not inline, not in start/stop block)
- `/* c8 ignore next */` excludes only the immediately following line from its metric
- Placing a start/stop block around a multi-branch section reduces the branch denominator — covered branches now represent a higher fraction, but uncovered ones elsewhere become more visible
- Adding or removing blocks changes both numerator AND denominator simultaneously, making percentage changes non-linear and hard to predict
- Oscillation symptom: functions 100% → add ignore block → branches 84% → remove block → functions 93% → repeat

## Details

During the TASK-027 coverage session on `ridesRouter.ts`, a classic oscillation developed. The router had several fire-and-forget `.catch()` callbacks that are structurally unreachable through the HTTP layer. The instinct was to wrap them in `c8 ignore start/stop` blocks to exclude them from the function denominator. Each time a block was added, the function percentage improved but the branch percentage dropped below the 90% threshold, because the block also removed branches from the denominator, changing the ratio of covered to total branches elsewhere.

The mechanics: suppose a file has 10 functions (9 covered, 1 uncovered `.catch`) and 20 branches (18 covered, 2 uncovered). Functions = 90%, branches = 90%. Add `c8 ignore start/stop` around the `.catch` block: now 9 functions total (9 covered = 100%) but also 18 branches total (16 covered = 88.9%). Functions passed, branches failed. The block removed branches from the denominator but not all of the uncovered ones — creating an asymmetry.

The correct approach is to understand the exact uncovered lines from the coverage report BEFORE adding any ignore directives. Adding ignores blindly based on intuition creates the oscillation. The hierarchy: (1) write real tests for genuinely reachable code, (2) delete dead code (defensive ternaries for library-guaranteed types), (3) add targeted `c8 ignore next` only for structurally unreachable single lines. Never use `start/stop` blocks unless you have verified in the report that the entire enclosed region should be excluded.

The `c8 ignore next` form is safer than `start/stop` because it affects exactly one line, making the denominator impact predictable and auditable. For `.catch()` callbacks, the directive must be on its own line before the arrow: `.catch(` newline `/* c8 ignore next */` newline `() => { ... })`. Inline placement (`/* c8 ignore next */ () => {}` on the same line) may not be respected by V8's instrumentation.

A secondary critical fact confirmed in TASK-133: `start/stop` blocks literally do not affect the function denominator in V8 coverage. If the goal is to exclude a function definition, only `/* c8 ignore next */` on the line immediately preceding the `() =>` declaration works. This means `start/stop` is useful only for excluding dead statement/branch code, not for hiding uncovered function bodies from the function coverage metric.

## Related Concepts

- [[concepts/coverage-gate-discipline]] - Parent discipline: never lower thresholds; use ignores only for structurally unreachable code
- [[concepts/hono-route-prefix-test-mismatch]] - Co-occurring issue in same session; real coverage gaps are preferable to paper coverage via ignores
- [[concepts/ci-parallel-jobs]] - Coverage thresholds enforced per job; oscillation is visible across parallel runs

## Sources

- [[daily/2026-05-03.md]] - Functions↔branches oscillation in ridesRouter coverage; c8 ignore start/stop removed in favor of targeted `c8 ignore next` on `.catch()` lines; batch-fixing all gaps at once rather than reactive single-line ignores identified as correct approach; TASK-133 confirmed that start/stop blocks do NOT affect V8 function definitions denominator — only `c8 ignore next` on the preceding line works for function coverage
