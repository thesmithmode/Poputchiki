---
title: "Atomic Task Management with tasks.json"
aliases: [tasks-json, task-queue, autonomous-development]
tags: [process, automation, project-management]
sources:
  - "daily/2026-05-01.md"
created: 2026-05-01
updated: 2026-05-01
---

# Atomic Task Management with tasks.json

Poputchiki uses a `tasks.json` file as an autonomous work queue. An AI agent (Claude Code) reads this file to select and execute tasks without human intervention per task. Work journal is in `progress.txt`.

## Key Points

- Tasks have statuses: `pending`, `done`, `blocked`
- Each task has: `phase`, `priority` (`critical` > `high` > `medium` > `low`), `dependencies` array
- Two phases: `phase=mvp` (TASK-001..114) and `phase=prod-deploy` (TASK-115..125)
- `prod-deploy` tasks are blocked until all `mvp` tasks are `done`
- Priority adjustments happened in the 2026-05-01 revision: TASK-052 low→high, TASK-062 low→critical, TASK-061 medium→high

## Details

The task queue grew from 106 to 125 tasks in the 2026-05-01 session: 8 missing core MVP tasks were added and 11 prod-deploy tasks were added as a new phase. The autonomous agent picks the highest-priority pending task whose all dependencies are `done`, executes it under TDD discipline, then marks it `done` with a `completed_at` UTC timestamp.

A JSON validation step after mass edits to `tasks.json` is critical given the 125-entry size — a single malformed entry can break the entire queue parser. State between sessions is preserved via `.memory/` (the claude-memory-compiler system), `tasks.json`, and `progress.txt`, enabling seamless resumption after a `/clear`.

Each task's `acceptance_criteria` maps directly to the agent's `TodoWrite` entries for that iteration, creating a tight loop between specification and execution.

## Related Concepts

- [[concepts/poputchiki-stack]] - The project this task queue governs
- [[concepts/deployment-pipeline]] - prod-deploy phase tasks that follow mvp completion

## Sources

- [[daily/2026-05-01.md]] - tasks.json expanded from 106 to 125 tasks; phase model established; priority bumps for TASK-052, TASK-061, TASK-062
