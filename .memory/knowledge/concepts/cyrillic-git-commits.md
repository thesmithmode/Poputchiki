---
title: "Cyrillic in Git Commits: Bash Encoding Bug"
aliases: [cyrillic-commits, git-encoding, powershell-commit]
tags: [git, encoding, gotcha, workflow]
sources:
  - "daily/2026-05-01.md"
created: 2026-05-01
updated: 2026-05-01
---

# Cyrillic in Git Commits: Bash Encoding Bug

Bash on Windows corrupts Cyrillic characters in `git commit -m` messages. The workaround is to use PowerShell heredoc syntax for any commit message containing Russian text.

## Key Points

- Bash (Git Bash / WSL) mangles UTF-8 Cyrillic characters when passed as `-m` arguments to `git commit`
- PowerShell handles Cyrillic correctly via heredoc syntax
- Project commit format: `ПРЕФИКС: описание на русском` (English prefix, Russian description)
- Valid prefixes: `FEAT`, `FIX`, `CHORE`, `DOCS`, `REFACTOR`, `TEST`
- AI attribution lines (`Co-Authored-By: Claude`, `Generated with Claude Code`) are forbidden in all commits

## Details

The Poputchiki project requires Russian-language commit descriptions as a convention. When Claude Code (or any agent) runs `git commit` via Bash with a Cyrillic message, the encoding breaks, producing garbled output in the git log. The fix is to use a PowerShell heredoc:

```powershell
git commit -m @"
FEAT: добавлена авторизация через Telegram
"@
```

Or the bash here-doc form that avoids the encoding issue:

```bash
git commit -m "$(cat <<'EOF'
FEAT: добавлена авторизация через Telegram
EOF
)"
```

This is a known environment-specific gotcha that surfaced during the first autonomous development session on 2026-05-01.

## Related Concepts

- [[concepts/tasks-json-management]] - Autonomous agent that writes these commits
- [[concepts/poputchiki-stack]] - Project context where this rule applies

## Sources

- [[daily/2026-05-01.md]] - Discovered during mass documentation commits; PowerShell heredoc established as the workaround
