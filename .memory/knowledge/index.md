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
| [[concepts/memory-flush-system]] | Background flush.py extracts session knowledge into daily logs; FLUSH_ERROR = exit code 1 failure mode | daily/2026-05-02.md | 2026-05-02 |
