---
title: "Subagent Git Author Control"
aliases: [subagent-commits, git-author-override, claude-commit-author]
tags: [git, agents, workflow, gotcha]
sources:
  - "daily/2026-05-03.md"
created: 2026-05-03
updated: 2026-05-03
---

# Subagent Git Author Control

When Claude Code spawns subagents (via the Agent tool) to perform development tasks, those subagents commit code under their own identity — `Claude <noreply@anthropic.com>` — rather than the project's configured git user. This causes all commits from a multi-agent session to carry the wrong author, blocking squash merge into protected branches.

## Key Points

- Subagents inherit a separate shell environment and do not automatically inherit `GIT_AUTHOR_NAME`/`GIT_COMMITTER_NAME` from the parent session
- In the 2026-05-03 session, all 25 commits on `feat/auto-dev` were authored by `Claude <noreply@anthropic.com>`
- The Poputchiki project explicitly bans `Co-Authored-By: Claude` and all `noreply@anthropic.com` attribution in commits
- The fix at time of discovery: squash all subagent commits into one clean commit authored by `thesmithmode` before merging
- Permanent fix needed: enforce `GIT_AUTHOR_NAME`/`GIT_COMMITTER_NAME` environment variables for all subagents via shell configuration or CLAUDE.md hooks

## Details

The problem was discovered during a code review pass before merging `feat/auto-dev` into `dev`. Anton blocked the merge and required a full audit. The resolution was to squash all 25 commits into a single commit (`6b46d2f`) with the correct author identity, then perform the merge.

The root cause is architectural: subagents spawned via the `Agent` tool run in isolated subprocesses. Unless the parent explicitly passes environment overrides (`GIT_AUTHOR_NAME`, `GIT_COMMITTER_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_EMAIL`), subagents use whatever identity is configured in their subprocess environment, which defaults to Claude's own identity rather than the project's git config.

A robust solution would be to set these variables in the project's `.claude/settings.json` hooks or in the subagent prompt template, ensuring every subagent commit carries the correct author before the commit is created rather than requiring a squash after the fact.

## Related Concepts

- [[concepts/cyrillic-git-commits]] - Related git commit convention (Russian descriptions, PowerShell heredoc)
- [[concepts/tasks-json-management]] - Subagents are spawned per-task from this queue
- [[concepts/deployment-pipeline]] - Branch protection enforces correct authorship before merge

## Sources

- [[daily/2026-05-03.md]] - All 25 commits on feat/auto-dev authored by Claude; blocked merge; squash to thesmithmode identity as workaround; need env var enforcement
