---
title: "Batch CI Fix Discipline (vs Reactive Push Loop)"
aliases: [batch-ci-fix, reactive-ci-loop, ci-fix-discipline]
tags: [ci-cd, workflow, discipline, testing]
sources:
  - "daily/2026-05-03.md"
created: 2026-05-03
updated: 2026-05-03
---

# Batch CI Fix Discipline (vs Reactive Push Loop)

Reactive CI fixing — push → wait → see one failure → fix → push → wait → see next failure — multiplies round-trips and time lost to queue latency. The correct discipline is to collect the full failure surface first, then fix all issues in a single commit.

## Key Points

- Reactive loop cost: each round-trip = CI queue wait (2–10 min) + job execution (~5 min) = 7–15 min per failure
- Batch approach: after first CI red, download full coverage report + all job logs before writing any fix
- One commit covering all failures is always better than N commits each fixing one
- Root cause of reactive loops: "CI only" rule prevents local test runs, so each CI run is the only feedback signal
- Sequential CI (fail-fast) hides downstream failures; parallel jobs expose all failures in one run — prerequisite for batch fixing

## Details

The reactive loop pattern was repeatedly observed in the 2026-05-03 Poputchiki sessions. A push to `dev` triggered CI; one job failed; a fix was applied and pushed; the next job failed; another fix was applied. The session accumulated ~15 commits over several hours fixing TS type errors that could have been caught as a batch in 2–3 commits.

The root structural cause is the "CI only" rule: to maintain clean separation between local dev and CI, local test runs are prohibited. This is a valid tradeoff for correctness (no "works on my machine" divergence) but it means every feedback cycle costs a full CI run. The mitigation is discipline at the point of each push: before pushing, explicitly ask "what are ALL the ways this could fail?" and check coverage reports, typecheck output, and lint output locally where possible (typecheck and lint are explicitly allowed locally in the project rules), reserving CI for integration/E2E-only failures.

When a CI run does fail, the correct response is: (1) read all failing job logs fully, not just the first error; (2) inspect the full coverage report to see every uncovered line, not just the headline metric; (3) write all fixes; (4) run local typecheck + lint before pushing; (5) push once. The "working blind" tax is unavoidable for integration tests but optional for type errors.

The parallel jobs CI architecture is a prerequisite for batch fixing: with sequential CI, you genuinely cannot see all failures in one run. With 8 parallel jobs, all failure surfaces are visible simultaneously, making the batch approach tractable.

## Related Concepts

- [[concepts/ci-parallel-jobs]] - Parallel jobs expose all failures in one run; prerequisite for batch discipline
- [[concepts/coverage-gate-discipline]] - Coverage failures are part of the batch to fix; never lower threshold as a shortcut
- [[concepts/typescript-type-debt]] - TS debt accumulation is the canonical example of reactive loop damage
- [[concepts/c8-ignore-denominator-oscillation]] - Oscillation from c8 ignore is easier to diagnose with full report in hand before any fix

## Sources

- [[daily/2026-05-03.md]] - Session 15:37: user demanded all failures visible in one run; session 15:59: user explicitly called out push→fail cycle inefficiency; session 13:28: ~15 commits fixing accumulated TS errors one at a time — exemplifies the anti-pattern
