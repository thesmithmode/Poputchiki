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
| [[concepts/pre-push-agent-hook]] | Claude Code agent hook fires on git push → haiku reviews diff → ALLOW/BLOCK; doesn't fire if settings.json changed same session | daily/2026-05-03.md | 2026-05-03 |
| [[concepts/zod-uuid-strict-validation]] | Zod v4 `z.uuid()` enforces RFC 4122 version/variant bits; sequential test fixtures like `11111111-...` fail with 422 | daily/2026-05-03.md | 2026-05-03 |
| [[concepts/batch-ci-fix-discipline]] | Reactive push→fail→fix loop wastes CI queue time; collect full failure surface first, fix all in one commit | daily/2026-05-03.md | 2026-05-03 |
| [[concepts/truncate-cascade-test-isolation]] | `TRUNCATE ... CASCADE` helper removes FK ordering problems in test teardown; `fileParallelism: false` prevents deadlock | daily/2026-05-03.md | 2026-05-03 |
| [[concepts/auth-security-vulnerabilities]] | XFF spoofing bypasses rate-limit; idempotency race; soft-deleted users can refresh; logout doesn't revoke JTI | daily/2026-05-03.md | 2026-05-03 |
| [[concepts/advisory-lock-pool-safety]] | `pg_try_advisory_lock` session-level breaks in connection pools; use `pg_try_advisory_xact_lock` inside `sql.begin()` | daily/2026-05-04.md | 2026-05-04 |
| [[concepts/on-conflict-constraint-pitfall]] | `ON CONFLICT DO NOTHING` without unique constraint silently inserts duplicates; use `WHERE NOT EXISTS` instead | daily/2026-05-04.md | 2026-05-04 |
| [[concepts/hono-use-vs-handler-chain]] | `app.use("/", mw)` fires on ALL methods; use `app.post("/", mw, handler)` chain for POST-only middleware | daily/2026-05-06.md | 2026-05-06 |
| [[concepts/hono-onerror-required]] | Hono 4: `app.onError` required to catch handler errors; catch-middleware does NOT intercept thrown errors | daily/2026-05-06.md | 2026-05-06 |
| [[concepts/task-completion-integrity]] | Tasks marked done by writing green tests for existing code — not real TDD; red→green cycle required | daily/2026-05-06.md | 2026-05-06 |
| [[concepts/vi-fn-undefined-sql-mock]] | `vi.fn()` returns undefined; SQL destructuring `const [row] = await sql()` throws TypeError — use `mockResolvedValue([])` | daily/2026-05-06.md | 2026-05-06 |
| [[concepts/docker-healthcheck-curl]] | `oven/bun:1-alpine` and `caddy:2-alpine` lack `curl` → healthchecks fail → auto-rollback loop on every deploy | daily/2026-05-08.md | 2026-05-08 |
| [[concepts/superuser-database-url-rls-bypass]] | POSTGRES_USER in DATABASE_URL → superuser bypasses RLS entirely; app role from init scripts never used | daily/2026-05-08.md | 2026-05-08 |
| [[concepts/sse-pool-connection-ceiling]] | Each SSE connection = 1 pool connection (max=20) → ~150 concurrent ceiling, not 50k; requires PgBouncer+Redis fix | daily/2026-05-08.md | 2026-05-08 |
| [[concepts/ci-env-vs-docker-init]] | Roles/extensions in Docker init don't exist in CI PostgreSQL; need explicit setup step before migrations | daily/2026-05-08.md | 2026-05-08 |
| [[concepts/revoke-select-before-rls]] | `REVOKE SELECT` fires before RLS evaluation; test expecting empty result gets `permission denied` instead | daily/2026-05-08.md | 2026-05-08 |
| [[concepts/csrf-startswith-prefix-attack]] | CSRF origin `startsWith` → `app.domain.attacker.com` bypass; use exact equality or allowlist `.includes()` | daily/2026-05-08.md | 2026-05-08 |
