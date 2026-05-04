---
title: "Claude Code Auto-Compact Window Configuration"
aliases: [auto-compact, autoCompactWindow, compact-threshold]
tags: [tooling, claude-code, configuration, gotcha]
sources:
  - "daily/2026-05-03.md"
created: 2026-05-03
updated: 2026-05-03
---

# Claude Code Auto-Compact Window Configuration

`autoCompactWindow` as a top-level key in `.claude/settings.json` is undocumented and silently ignored by Claude Code. The only supported mechanism is the `CLAUDE_CODE_AUTO_COMPACT_WINDOW` environment variable, which must be set before session start.

## Key Points

- `autoCompactWindow: 150000` in `settings.json` top-level = no effect (not in official schema)
- `autoCompactEnabled: false` as top-level key = also no effect
- Correct method: `env.CLAUDE_CODE_AUTO_COMPACT_WINDOW=150000` in settings.json or shell environment
- Auto-compact fires mid-turn when the token threshold is hit — it does not wait for the end of a task
- Environment variable changes take effect only after a full Claude Code session restart

## Details

During a 2026-05-03 session working on TASK-022, the compact threshold was discovered to be firing unexpectedly. Investigation revealed that `autoCompactWindow` had been placed as a top-level key in `settings.json`, following undocumented examples. Claude Code's actual schema does not recognize this key.

The migration: move the threshold configuration from `settings.json` top-level into the `env` section as `CLAUDE_CODE_AUTO_COMPACT_WINDOW`. This env variable is read at session initialization and controls when automatic context compaction triggers. At 150,000 tokens, Claude Code compresses earlier conversation context to extend the effective session length.

The mid-turn behavior is notable: compaction can interrupt an in-progress task execution. The `PreCompact` hook in the memory flush system was designed specifically to capture context before this interruption, ensuring session knowledge is not lost when compaction fires mid-task.

## Related Concepts

- [[concepts/memory-flush-system]] - PreCompact hook runs when auto-compact fires; preserves context before summarization
- [[concepts/tasks-json-management]] - Long sessions working through many tasks are most affected by compaction

## Sources

- [[daily/2026-05-03.md]] - autoCompactWindow top-level key discovered non-functional; migrated to env.CLAUDE_CODE_AUTO_COMPACT_WINDOW in settings.json; mid-turn compaction behavior noted
