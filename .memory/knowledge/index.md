# Knowledge Base Index

| Article | Summary | Compiled From | Updated |
|---------|---------|---------------|---------|
| [[concepts/poputchiki-stack]] | Full tech stack: Hono+Bun backend, React SPA, self-hosted Postgres, Docker Compose, Traefik | daily/2026-05-01.md | 2026-05-01 |
| [[concepts/self-hosted-postgres]] | PostgreSQL 16 in Docker; no Supabase/Neon/managed services; pgcrypto PII encryption | daily/2026-05-01.md | 2026-05-01 |
| [[concepts/rls-guc-identity]] | RLS identity via `app.current_user_id` GUC set by API per-transaction, replacing Supabase `auth.uid()` | daily/2026-05-01.md | 2026-05-01 |
| [[concepts/tasks-json-management]] | Autonomous task queue (tasks.json, 125 tasks, mvp + prod-deploy phases) driving AI-agent development | daily/2026-05-01.md | 2026-05-01 |
| [[concepts/deployment-pipeline]] | GHA → GHCR → SSH → docker compose deploy with pre-deploy backup, migration, smoke test, and rollback | daily/2026-05-01.md, daily/2026-05-08.md, daily/2026-05-13.md | 2026-05-13 |
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
| [[concepts/docker-healthcheck-curl]] | `oven/bun:1-alpine` and `caddy:2-alpine` lack `curl`/`wget` → healthchecks fail → auto-rollback loop on every deploy | daily/2026-05-08.md, daily/2026-05-13.md | 2026-05-13 |
| [[concepts/superuser-database-url-rls-bypass]] | POSTGRES_USER in DATABASE_URL → superuser bypasses RLS entirely; app role from init scripts never used | daily/2026-05-08.md | 2026-05-08 |
| [[concepts/sse-pool-connection-ceiling]] | Each SSE connection = 1 pool connection (max=20) → ~150 concurrent ceiling, not 50k; requires PgBouncer+Redis fix | daily/2026-05-08.md | 2026-05-08 |
| [[concepts/ci-env-vs-docker-init]] | Roles/extensions in Docker init don't exist in CI PostgreSQL; need explicit setup step before migrations | daily/2026-05-08.md | 2026-05-08 |
| [[concepts/revoke-select-before-rls]] | `REVOKE SELECT` fires before RLS evaluation; test expecting empty result gets `permission denied` instead | daily/2026-05-08.md | 2026-05-08 |
| [[concepts/csrf-startswith-prefix-attack]] | CSRF origin `startsWith` → `app.domain.attacker.com` bypass; use exact equality or allowlist `.includes()` | daily/2026-05-08.md | 2026-05-08 |
| [[concepts/bun-lockfile-frozen-ci]] | `bun.lock` must be committed when package.json changes; `--frozen-lockfile` in CI fails on stale lockfile | daily/2026-05-08.md | 2026-05-13 |
| [[concepts/ci-workflow-branch-triggers]] | CI triggers only on `dev`/`main`; feature branches get no CI until squash-merged to dev | daily/2026-05-08.md | 2026-05-13 |
| [[concepts/x-frame-options-telegram-embedding]] | `X-Frame-Options DENY` blocks Telegram WebApp iframe embedding — breaks Mini App entirely | daily/2026-05-08.md | 2026-05-13 |
| [[concepts/middleware-bodylimit-before-ratelimit]] | `bodyLimit` must precede `rateLimit` — wrong order allows DoS via large bodies before rate check fires | daily/2026-05-08.md | 2026-05-13 |
| [[concepts/postgres-custom-config-nullifies-defaults]] | Custom `config_file=` overrides ALL postgres image defaults; must explicitly set `listen_addresses` and `hba_file` | daily/2026-05-13.md | 2026-05-13 |
| [[concepts/pg-isready-tcp-vs-unix-socket]] | `pg_isready` without `-h` checks Unix socket; Docker containers connect via TCP → false-healthy healthcheck | daily/2026-05-13.md | 2026-05-13 |
| [[concepts/postgres-volume-init-idempotency]] | `POSTGRES_DB` + init scripts run ONLY on empty volume; hardcoded DB names in SQL = antipattern | daily/2026-05-13.md | 2026-05-13 |
| [[concepts/docker-compose-run-skips-healthcheck]] | `docker compose run` ignores `depends_on: service_healthy`; use `up -d --wait` before migrations | daily/2026-05-13.md | 2026-05-13 |
| [[concepts/reactive-deploy-fix-loop]] | 15 failed deploys from reactive fix→push→fail loop; pre-deploy static audit prevents cascade | daily/2026-05-13.md | 2026-05-13 |
| [[concepts/traefik-docker-api-compat]] | Traefik pinned version bundles old Docker client API → incompatible with newer Docker daemon → no service discovery, no TLS | daily/2026-05-13.md | 2026-05-13 |
| [[concepts/caddy-alpine-missing-modules]] | `caddy:2-alpine` lacks Brotli encoder (config crash) and wget (healthcheck failure); fix: remove `br`, `apk add wget` | daily/2026-05-13.md | 2026-05-13 |
| [[concepts/healthcheck-process-vs-application]] | `kill -0 1` only checks PID — silent crash (process alive, app dead) not detected; use HTTP probe or sentinel file | daily/2026-05-13.md | 2026-05-13 |
| [[concepts/webhook-port-bind-mismatch]] | App binds port 3002, Dockerfile EXPOSE + healthcheck reference 3001 → container permanently unhealthy | daily/2026-05-13.md | 2026-05-13 |
| [[concepts/node-pg-migrate-dotenv-docker]] | `--envPath .env` flag triggers `require('dotenv')` even in Docker where env is already injected | daily/2026-05-13.md | 2026-05-13 |
| [[concepts/traefik-acme-http01-port80]] | ACME HTTP-01 needs port 80 open; `ufw inactive` ≠ no firewall — iptables may block; `acme.json` empty = first diagnostic | daily/2026-05-13.md | 2026-05-13 |
| [[concepts/vite-api-base-env-var]] | Hardcoded `/api` in apiFetch breaks subdomain routing; use `VITE_API_BASE` + centralized auto-prefix for non-auth routes | daily/2026-05-13.md | 2026-05-13 |
| [[concepts/telegram-desktop-miniapp-url-cache]] | Telegram Desktop caches Mini App URL; full restart required after BotFather Menu Button URL change | daily/2026-05-13.md | 2026-05-13 |
| [[concepts/deploy-single-healthcheck-window]] | Single 60s timeout for all 5 services → false rollback when notifier/cron start slowly; use staged per-service timeouts | daily/2026-05-13.md | 2026-05-13 |
| [[concepts/trivy-base-image-cve-management]] | Base image CVEs (Go stdlib in bun:1-alpine) block Trivy gate; manage with .trivyignore + periodic audit on image bumps | daily/2026-05-13.md | 2026-05-13 |
| [[connections/post-deploy-invisible-failures]] | Deploy reports success but app broken: Telegram URL cache + hardcoded API path + ACME/TLS failure all invisible to healthchecks | daily/2026-05-13.md | 2026-05-13 |
| [[concepts/telegram-hashrouter-tgwebappdata]] | Telegram `#tgWebAppData=...` hash conflicts with React HashRouter → blank screen; strip hash before mount | daily/2026-05-13.md | 2026-05-13 |
| [[concepts/leaflet-css-zero-height]] | Leaflet requires explicit CSS import; without it map collapses to 0px — no errors, just invisible | daily/2026-05-14.md | 2026-05-14 |
| [[concepts/test-assertion-contract-drift]] | Tests with exact-arg assertions break when implementation adds fields; use `objectContaining` or sync tests | daily/2026-05-14.md | 2026-05-14 |
| [[concepts/redesign-test-maintenance-cascade]] | UI redesign triggers cascade: aria-label mismatches, deleted feature tests, Biome empty-line lint failures | daily/2026-05-14.md | 2026-05-14 |
| [[concepts/csp-tile-provider-telegram]] | CSP in Telegram WebApp blocks cartocdn.com tiles; switch to tile.openstreetmap.org | daily/2026-05-14.md | 2026-05-14 |
| [[concepts/telegram-mainbutton-dom-conflict]] | DOM FAB duplicates Telegram MainButton; use `hasMainButton` state guard to show only one | daily/2026-05-14.md | 2026-05-14 |
| [[concepts/css-filter-dark-map-theme]] | CSS `filter: invert(1) hue-rotate(180deg)` on Leaflet tiles for dark theme — no extra tile provider needed | daily/2026-05-14.md | 2026-05-14 |
| [[concepts/non-blocking-map-loading]] | Show Leaflet map immediately; 5s fallback timer for CSP-blocked or unreachable tile providers | daily/2026-05-14.md | 2026-05-14 |
| [[concepts/leaflet-async-init-test-timing]] | mapRef.current = null in tests — Leaflet init is async; wait for init before dispatching click events | daily/2026-05-14.md | 2026-05-14 |
| [[concepts/telegram-disable-vertical-swipes]] | Telegram intercepts vertical swipes for swipe-to-close; call `disableVerticalSwipes()` to allow map panning | daily/2026-05-14.md | 2026-05-14 |
| [[connections/telegram-webapp-invisible-constraints]] | 6 undocumented Telegram WebApp constraints: CSP, URL cache, hash injection, MainButton, X-Frame-Options, swipe intercept | daily/2026-05-08.md, daily/2026-05-13.md, daily/2026-05-14.md | 2026-05-14 |
