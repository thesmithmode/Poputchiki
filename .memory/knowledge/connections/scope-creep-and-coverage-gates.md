---
title: "Connection: Scope Creep and Coverage Gate Violations"
connects:
  - "concepts/scope-creep-sentinel"
  - "concepts/coverage-gate-discipline"
sources:
  - "daily/2026-05-03.md"
created: 2026-05-03
updated: 2026-05-03
---

# Connection: Scope Creep and Coverage Gate Violations

## The Connection

Scope creep and coverage gate violations frequently co-occur and reinforce each other. When a task expands beyond its original scope, new code is written without the matching tests. The coverage gate then turns red. The tempting shortcut — lowering the threshold — compounds the scope problem by permanently degrading the quality bar.

## Key Insight

Scope creep creates untested surface area. Untested surface area triggers coverage failures. Coverage failures create pressure to lower thresholds. Lowering thresholds hides the untested code and normalizes the pattern for future tasks. The two problems have a single root cause: work proceeding without CI green validation at each step.

In the 2026-05-03 Poputchiki session, TASK-133 (test hardening) grew through two migrations into a book_seat rewrite. The rewrite added new SQL logic. Coverage on that logic was incomplete. The response was to drop the integration threshold from 95% to 55% — caught and reversed immediately. The correct path was: stop scope creep at the migration boundary, write tests for the new migration before proceeding, keep the threshold intact.

## Evidence

From the 2026-05-03 session:
- TASK-133 → migration 011 → migration 012 → TASK-134 + TASK-135 (scope creep chain)
- Coverage threshold dropped 95% → 55% (threshold violation)
- Both patterns were caught in the same code review pass, confirming they are co-symptoms
- TASK-135 deleted as a band-aid; threshold restored to 95%; migrations flagged for squash

## Related Concepts

- [[concepts/scope-creep-sentinel]] - How TDD sentinels trigger the scope creep chain
- [[concepts/coverage-gate-discipline]] - Why thresholds must not be lowered
- [[concepts/tasks-json-management]] - The task queue where scope creep materializes as new entries
- [[concepts/ci-parallel-jobs]] - CI pipeline that enforces coverage gates
