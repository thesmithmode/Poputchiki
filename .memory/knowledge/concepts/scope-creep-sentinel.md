---
title: "Scope Creep via TDD Sentinel Pattern"
aliases: [scope-creep, sentinel-scope-creep, tdd-scope]
tags: [process, tdd, discipline, gotcha]
sources:
  - "daily/2026-05-03.md"
  - "daily/2026-05-04.md"
  - "daily/2026-05-08.md"
created: 2026-05-03
updated: 2026-05-13
---

# Scope Creep via TDD Sentinel Pattern

A TDD sentinel test written to expose a production bug can trigger a chain of architectural changes that causes the original task to be forgotten. Each layer of fix reveals another problem, and the developer ends up three layers deep in unrelated migrations while the sentinel task remains open.

## Key Points

- Pattern: TASK-133 (test hardening) → sentinel catches prod bug → migration 011 (SECURITY DEFINER) → migration 012 (book_seat rewrite) → TASK-134, TASK-135 created → TASK-133 forgotten
- Multiple cascaded migrations in one session = chaotic; prefer single migration per concern
- TASK-135 (band-aid task referencing non-existent problem) was created and then deleted same session
- `book_seat` returning 0 rows for 3 different failure cases (no identity / no seats / caller==driver) = weak error semantics; all mapped to 409 Conflict
- Recovery trigger: "вспомни глобально задачу, на верном ли пути" — full architectural review forced by user
- Second pattern: refactoring helper created (e.g., `withLock`) but not all callers migrated — 4 cron files left using inline locks; coverage does not catch this if inline code still executes
- Third pattern: REFACTOR renames methods in one file but leaves callers using the old names — `dispatcher.ts` referenced `incListenConnections`/`decListenConnections` after a REFACTOR renamed them to `incSseSubscribers`/`decSseSubscribers`; runtime crash, not compile error

## Details

The scope creep pattern starts with legitimate TDD work: write a sentinel test to expose a known production bug. The test fails as expected, revealing the bug. The natural next step is to fix the bug — but the fix requires a database migration, which spawns a new task, which is added to `tasks.json`. The migration reveals a second issue, spawning a second migration. By the time the developer surfaces for air, three new tasks exist, two migrations have been written, and the original task's acceptance criteria have not been met.

In the specific 2026-05-03 case, the fix required splitting `book_seat` error semantics into distinct HTTP status codes (401 Unauthorized vs 409 Conflict vs 422 Unprocessable Entity) rather than mapping all failures to 409. The SQL rewrite also had an unverified claim: it was supposed to fix a seats race condition, but the root cause was not confirmed before writing the migration.

The recovery pattern is explicit scope review ("am I on the right path?") combined with deleting band-aid tasks that reference non-existent problems. Tasks created to work around a misdiagnosis should be deleted, not deferred.

## Related Concepts

- [[concepts/tasks-json-management]] - tasks.json is where scope creep materializes as new TASK entries
- [[concepts/coverage-gate-discipline]] - Scope creep often co-occurs with coverage threshold pressure
- [[concepts/rls-guc-identity]] - SECURITY DEFINER migrations relate to RLS identity context

## Sources

- [[daily/2026-05-03.md]] - TASK-133 scope crept into migrations 011+012; TASK-135 created then deleted; book_seat error semantics identified as weak; user forced architectural review to reset scope
- [[daily/2026-05-04.md]] - Session 09:48: TASK-089 created `withLock` helper but left 4 cron files using inline advisory lock pattern — incomplete refactoring; coverage passed because inline code still ran, hiding that the helper was not universally adopted
- [[daily/2026-05-08.md]] - Memory flush 18:10: REFACTOR renamed SSE dispatcher methods (`incListenConnections` → `incSseSubscribers`) but `dispatcher.ts` kept old method names — shim removed without updating the caller; runtime crash, TypeScript did not catch it because dispatch methods were dynamically typed
