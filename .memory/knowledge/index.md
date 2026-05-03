# Knowledge Base Index

| Article | Summary | Compiled From | Updated |
|---------|---------|---------------|---------|
| [[concepts/poputchiki-stack]] | Full tech stack: Hono+Bun backend, React SPA, self-hosted Postgres, Docker Compose, Traefik | daily/2026-05-01.md | 2026-05-01 |
| [[concepts/self-hosted-postgres]] | PostgreSQL 16 in Docker; no Supabase/Neon/managed services; pgcrypto PII encryption | daily/2026-05-01.md | 2026-05-01 |
| [[concepts/rls-guc-identity]] | RLS identity via `app.current_user_id` GUC set by API per-transaction, replacing Supabase `auth.uid()` | daily/2026-05-01.md | 2026-05-01 |
| [[concepts/tasks-json-management]] | Autonomous task queue (tasks.json, 125 tasks, mvp + prod-deploy phases) driving AI-agent development | daily/2026-05-01.md | 2026-05-01 |
| [[concepts/deployment-pipeline]] | GHA → GHCR → SSH → docker compose deploy with pre-deploy backup, migration, smoke test, and rollback | daily/2026-05-01.md | 2026-05-01 |
| [[concepts/cyrillic-git-commits]] | Bash corrupts Cyrillic in git commit messages; use PowerShell heredoc instead | daily/2026-05-01.md | 2026-05-01 |
| [[connections/rls-and-self-hosted-postgres]] | Causal link: self-hosted Postgres migration forced the GUC-based RLS identity pattern | daily/2026-05-01.md | 2026-05-01 |
| [[concepts/memory-flush-system]] | Background flush.py extracts session knowledge into daily logs; FLUSH_ERROR = exit code 1 failure mode | daily/2026-05-02.md | 2026-05-03 |
| [[concepts/subagent-git-author]] | Subagents commit as `Claude <noreply@anthropic.com>` — must enforce GIT_AUTHOR_NAME env var override | daily/2026-05-03.md | 2026-05-03 |
| [[concepts/ci-parallel-jobs]] | 8 parallel GHA jobs (lint/typecheck/unit/integration/security/web/audit/gitleaks) + ci-summary aggregator | daily/2026-05-03.md | 2026-05-03 |
| [[concepts/typescript-type-debt]] | TS type errors accumulate when tasks merge without CI gate; unified HttpStatus enum as resolution pattern | daily/2026-05-03.md | 2026-05-03 |
| [[concepts/coverage-gate-discipline]] | Never lower coverage thresholds to pass CI; use c8 ignore for untestable code only | daily/2026-05-03.md | 2026-05-03 |
| [[concepts/postgres-js-isolation-level]] | `sql.begin("repeatable read")` → SQL syntax error; must pass full `ISOLATION LEVEL REPEATABLE READ` | daily/2026-05-03.md | 2026-05-03 |
| [[concepts/scope-creep-sentinel]] | TDD sentinel → prod bug fix → cascade of migrations → original task forgotten; recovery = forced scope review | daily/2026-05-03.md | 2026-05-03 |
| [[concepts/claude-code-auto-compact]] | `autoCompactWindow` in settings.json top-level is ignored; use `env.CLAUDE_CODE_AUTO_COMPACT_WINDOW` | daily/2026-05-03.md | 2026-05-03 |
| [[connections/scope-creep-and-coverage-gates]] | Scope creep creates untested code → coverage fails → pressure to lower threshold; both have same root cause | daily/2026-05-03.md | 2026-05-03 |
| [[concepts/hono-route-prefix-test-mismatch]] | Test URL includes mount prefix → wrong handler matches silently → 0% coverage on target handler despite green tests | daily/2026-05-03.md | 2026-05-03 |
| [[concepts/c8-ignore-denominator-oscillation]] | c8 ignore start/stop changes function AND branch denominators independently → oscillation between failing metrics | daily/2026-05-03.md | 2026-05-03 |
