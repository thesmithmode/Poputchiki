---
title: "Memory Flush System (claude-memory-compiler)"
aliases: [memory-flush, session-memory, flush-error]
tags: [tooling, workflow, automation, session-management]
sources:
  - "daily/2026-05-01.md"
  - "daily/2026-05-02.md"
  - "daily/2026-05-03.md"
  - "daily/2026-05-14.md"
created: 2026-05-01
updated: 2026-05-14
---

# Memory Flush System (claude-memory-compiler)

The `.memory/` directory houses a knowledge compiler system that preserves agent state between Claude Code sessions. A background `flush.py` process extracts key decisions and learnings from each session's conversation transcript and appends them to a daily log, which is then compiled into structured wiki articles.

## Key Points

- State persists across sessions via `.memory/` + `tasks.json` + `progress.txt` — enabling seamless `/clear` and restart
- Memory flush runs as a detached background process at session end (and optionally pre-compact)
- Flush output is appended to `daily/YYYY-MM-DD.md` as timestamped `### Memory Flush (HH:MM)` blocks
- A `FLUSH_ERROR` entry in the daily log indicates the background process exited with a non-zero code
- Known failure: `FLUSH_ERROR: Exception: Command failed with exit code 1` — seen twice on 2026-05-02 (22:43 and 23:10), at least 8 times on 2026-05-03, and 6 times on 2026-05-14 (13:18, 14:17, 16:06, 16:09, 16:47, 17:04)
- Additional failure variant observed 2026-05-03 (14:28): `FLUSH_ERROR: Exception: Control request timeout: initialize` — suggests SDK initialization failure, possibly network or credential timeout
- Persistent multi-week failures (2026-05-02 through 2026-05-14) across many sessions indicate a systemic environment issue, not a per-session transient fault; successful `FLUSH_OK` results still occur intermittently alongside errors

## Details

The compiler pipeline has three layers: raw conversation transcripts (JSONL) are parsed by the flush hook, summarized by a Claude API call, and appended to the daily log. At end-of-day (after 18:00 local), the compiler (`compile.py`) ingests the daily log and writes or updates wiki articles in `knowledge/`. The `knowledge/index.md` master catalog is the primary retrieval mechanism injected into each new session via the `session-start.py` hook.

A `FLUSH_ERROR` with exit code 1 typically indicates one of: a missing or malformed JSONL transcript path, an expired or missing Claude API credential at `~/.claude/.credentials.json`, a Python dependency issue in the `uv` environment, or a recursion guard triggered by the `CLAUDE_INVOKED_BY` environment variable. When a flush fails, the session's knowledge is lost for that session but prior state in `tasks.json` and `progress.txt` remains intact, so no work is lost — only the memory extraction for that session.

## Debugging Flush Errors

- Check `~/.claude/.credentials.json` exists and is valid
- Run `uv run python scripts/flush.py --debug` manually with the transcript path
- Ensure `CLAUDE_INVOKED_BY` is not set in the shell environment when testing manually
- Verify `pyproject.toml` dependencies are installed: `uv sync`

## Related Concepts

- [[concepts/tasks-json-management]] - The other persistence mechanism (task state across sessions)
- [[concepts/poputchiki-stack]] - The project whose development sessions are being captured

## Sources

- [[daily/2026-05-01.md]] - Memory system in use; first successful compilation of knowledge base
- [[daily/2026-05-02.md]] - FLUSH_ERROR at 22:43 and 23:10 (exit code 1 both times); repeated failure confirms persistent issue; no session content captured for the day
- [[daily/2026-05-03.md]] - FLUSH_ERROR at least 10 times throughout the day (exit code 1 most; one "Control request timeout: initialize" at 14:28); rich session content exists only because sessions wrote structured logs manually; systemic environment issue confirmed
- [[daily/2026-05-14.md]] - 6 FLUSH_ERRORs (exit code 1) interspersed with 5 FLUSH_OK results (13:24, 13:28, 16:33, 17:31, 18:22); pattern continues 12 days after first observation; intermittent success confirms partial functionality — not a total credential or environment failure
