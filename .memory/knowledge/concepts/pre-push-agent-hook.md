---
title: "Claude Code Pre-Push Agent Hook"
aliases: [pre-push-hook, agent-hook, attack-review-hook, pre-push-security]
tags: [tooling, claude-code, security, hooks, workflow]
sources:
  - "daily/2026-05-03.md"
created: 2026-05-03
updated: 2026-05-03
---

# Claude Code Pre-Push Agent Hook

A Claude Code `PreToolUse` hook can invoke an agent to review staged commits before `git push` executes, enabling automated adversarial security review at the git boundary. The hook spawns a haiku agent that inspects the diff and returns `ALLOW` or `BLOCK`.

> **Status (2026-05-03):** Hook was removed after testing — added friction without reliable benefit. The `/attack-review` skill remains for manual invocations.

## Key Points

- Hook type: `agent` in Claude Code `settings.json` hooks configuration; `"model"` field is optional — omitting it defaults to haiku automatically
- Trigger command pattern: `git diff origin/<branch>..HEAD` — generates the diff passed to the agent
- Hook does NOT fire when the branch is already up-to-date with remote (empty commit range → no diff → hook skips)
- Hook does NOT fire if `settings.json` was modified in the same Claude Code session — requires full session restart to pick up new hook configuration
- Companion skill `attack-review` stored at `~/.claude/commands/attack-review.md` supports `--base <ref>` flag and focus text for manual invocation

## Details

The pre-push agent hook was created on 2026-05-03 to enforce a security review gate before any push reaches the remote. The hook configuration lives in the global `~/.claude/settings.json` rather than a project-local `.claude/settings.json`, making it active across all projects.

The model field was deliberately omitted from the hook configuration. Claude Code defaults to haiku for agent hooks when no model is specified, which is sufficient for a diff-scanning security review. Explicitly specifying the model adds configuration noise without benefit.

Two behavioral gotchas were discovered during initial testing. First, running `git push` on a branch that has no new commits (already up-to-date) produces an empty diff range, so the hook never invokes the agent — the push proceeds silently. This is correct behavior but initially appeared as a bug. Second, modifying `settings.json` within an active Claude Code session does not reload the hooks configuration; the session must be fully restarted for changes to take effect. A hook that "doesn't work" after being configured is almost always due to a stale session.

The `attack-review` skill (`/attack-review`) provides a manual equivalent: it performs an adversarial code review of recent changes, attacks design choices, and identifies failure modes. It accepts `--base <ref>` to set the comparison base and optional focus text to direct attention to specific concerns. The skill and the hook are complementary — the hook is automatic and lightweight, the skill is manual and thorough.

## Related Concepts

- [[concepts/claude-code-auto-compact]] - Another Claude Code settings.json gotcha: top-level keys silently ignored; env vars required instead
- [[concepts/subagent-git-author]] - Related hook concern: subagents commit under wrong author identity
- [[concepts/deployment-pipeline]] - Pre-push hook guards what reaches the remote before CI runs

## Sources

- [[daily/2026-05-03.md]] - Session 22:26: attack-review skill created; pre-push agent hook configured; two behavioral gotchas discovered (empty diff range = no trigger; settings.json changes require session restart). Session 22:30: hook removed from settings.json — decided not needed; attack-review skill retained; agent hooks are silent on ALLOW (only observable signal is 5–15s delay before push executes)
