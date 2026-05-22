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
| [[concepts/advisory-lock-pool-safety]] | `pg_try_advisory_lock` session-level breaks in connection pools; use `pg_try_advisory_xact_lock` inside `sql.begin()`; winner-crash = silent 0 results | daily/2026-05-04.md, daily/2026-05-22.md | 2026-05-22 |
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
| [[concepts/useme-auth-flow]] | `useMe` hook: full Telegram MiniApp auth sequence — initData → tokens → /users/me; 401 → refresh (not re-auth); logout sends tokens in body | daily/2026-05-14.md | 2026-05-15 |
| [[concepts/apifetch-centralized-401-refresh]] | 401 refresh centralized in `apiFetch` utility — all hooks get automatic retry without duplicating logic | daily/2026-05-15.md | 2026-05-15 |
| [[concepts/banned-user-cache-invalidation]] | 30s in-memory cache for banned user status keyed by userId; invalidated immediately on DELETE /me | daily/2026-05-15.md | 2026-05-15 |
| [[concepts/cors-startup-failsafe]] | CORS throws at startup if DOMAIN env var is empty — fail-fast prevents silent CORS misconfiguration | daily/2026-05-15.md | 2026-05-15 |
| [[concepts/frontend-api-error-graceful-fallback]] | Catch ApiError → return null → show "адрес не найден"; re-throw non-ApiError for crash reporting | daily/2026-05-15.md | 2026-05-15 |
| [[concepts/sess-bind-jwt-session-fixation]] | `sess_bind=HMAC(jwtSecret, jti)` cookie ties session to specific JWT — prevents cross-user session leakage | daily/2026-05-16.md | 2026-05-16 |
| [[concepts/theme-css-semantic-tokens]] | Hardcoded hex breaks theme switching; semantic `--brand-*` CSS tokens + ThemeProvider + lint gate fix it | daily/2026-05-16.md | 2026-05-16 |
| [[concepts/docker-compose-profiles-silent-skip]] | Service with `profiles:` key not started by `docker compose up` — silently absent, no error or warning | daily/2026-05-16.md | 2026-05-16 |
| [[concepts/nominatim-pbf-region-sizing]] | Use `tatarstan-latest.osm.pbf` (~80MB) not volga-fed-district; `service_started` not `service_healthy` for API dep | daily/2026-05-16.md | 2026-05-16 |
| [[concepts/book-seat-on-accept-not-request]] | `book_seat()` must fire on driver accept, not on passenger request — otherwise `seats_taken` reflects pending not confirmed | daily/2026-05-17.md | 2026-05-17 |
| [[concepts/fire-and-forget-sql-mock]] | Every fire-and-forget INSERT in a handler requires an additional `mockResolvedValueOnce([])` in tests — add immediately, not after CI fails | daily/2026-05-17.md | 2026-05-17 |
| [[concepts/pg-notify-single-channel]] | Single `notify_user` channel with `user_id` in payload replaces per-event channel chaos; notifier listens once, dispatches by user_id | daily/2026-05-17.md | 2026-05-17 |
| [[concepts/localstorage-key-constants-in-tests]] | Tests must import the same localStorage key constant as the app — hardcoded string literals drift silently when key is renamed | daily/2026-05-17.md | 2026-05-17 |
| [[concepts/react-lazy-screen-splitting]] | `React.lazy` for heavy screens (Leaflet, EventsScreen) reduces initial bundle parse time in Telegram MiniApp WebView | daily/2026-05-17.md | 2026-05-17 |
| [[concepts/enqueue-notification-helper]] | Centralised `enqueueNotification` helper in packages/shared — atomically INSERTs user_notifications and fires pg_notify | daily/2026-05-18.md | 2026-05-18 |
| [[concepts/pg-notify-missing-user-notifications]] | 8 of 11 pg_notify call sites skipped INSERT into user_notifications — in-app feed showed no history | daily/2026-05-18.md | 2026-05-18 |
| [[concepts/notification-category-drift]] | 4 independent category lists across api/notifier/frontend/tests; notifier silently drops events with unrecognized type string | daily/2026-05-18.md | 2026-05-18 |
| [[concepts/telegram-bot-403-notify-disabled]] | Bot 403 on first message sets notify_disabled=true permanently; /start webhook must reset the flag | daily/2026-05-18.md | 2026-05-18 |
| [[concepts/notifier-service-role-rls]] | Service processes (notifier/cron) get silent 0 rows from RLS without `SET LOCAL ROLE poputchiki_service` | daily/2026-05-19.md | 2026-05-19 |
| [[concepts/telegram-webview-in-memory-cache]] | TG WebView caches JS bundle in-memory until process kill — distinct from BotFather URL cache | daily/2026-05-19.md | 2026-05-19 |
| [[concepts/from-to-coordinate-validation]] | 50m minimum ride distance via Zod refine(); equidistant approximation at 55°N (111000×64000) | daily/2026-05-19.md | 2026-05-19 |
| [[concepts/telegram-webhook-internal-api]] | TG callback buttons need `/internal/*` API route + `API_URL`/`INTERNAL_API_SECRET` in webhook service | daily/2026-05-19.md | 2026-05-19 |
| [[concepts/leaflet-divicon-xss]] | L.divIcon html option requires escapeHtml() on user data — innerHTML = XSS risk | daily/2026-05-19.md | 2026-05-19 |
| [[concepts/cache-bust-version-json]] | VITE_BUILD_SHA + version.json + visibilitychange hook forces bundle reload after deploy in Telegram WebView | daily/2026-05-19.md | 2026-05-19 |
| [[concepts/encryptpii-static-iv]] | Static IV in AES/pgcrypto PII encryption = ECB-like vulnerability; fix: `crypto.randomBytes(16)` prepended to ciphertext | daily/2026-05-20.md | 2026-05-20 |
| [[concepts/location-history-partitioning]] | location_history without partitioning → 864M rows/day at 50k users; fix: range partition by created_at + pg_partman | daily/2026-05-20.md | 2026-05-20 |
| [[concepts/deploy-sh-set-e]] | deploy.sh without `set -euo pipefail` allows failed migrations to continue; add flock for concurrent deploy safety | daily/2026-05-20.md | 2026-05-20 |
| [[concepts/atomic-update-race-condition]] | Two-step check+increment for seat counts races; fix: atomic `UPDATE ... WHERE count < max RETURNING id` | daily/2026-05-20.md | 2026-05-20 |
| [[concepts/pg-listen-reconnect-loop]] | PG LISTEN connection does not auto-reconnect on drop; implement exponential backoff reconnect loop | daily/2026-05-20.md | 2026-05-20 |
| [[concepts/userpublic-userinternal-pii]] | Single User type leaks PII via API responses; split into UserPublic (API) and UserInternal (service layer) | daily/2026-05-20.md | 2026-05-20 |
| [[concepts/jwt-refresh-race-condition]] | Concurrent 401 handlers all call /auth/refresh simultaneously → multiple valid refresh tokens, rotation broken | daily/2026-05-20.md | 2026-05-20 |
| [[concepts/sse-broadcast-backpressure]] | Sequential for-await SSE broadcast: one slow client blocks all others — event loop saturation at 50k users | daily/2026-05-20.md | 2026-05-20 |
| [[concepts/postgres-stable-volatile-encryption]] | STABLE on encrypt_pii lets planner cache ciphertexts — identical plaintexts produce identical ciphertexts (ECB at SQL layer) | daily/2026-05-20.md | 2026-05-20 |
| [[concepts/force-row-level-security]] | Tables without FORCE ROW LEVEL SECURITY allow table owner/superuser to bypass all RLS policies | daily/2026-05-20.md | 2026-05-20 |
| [[concepts/n-plus-one-sse-invalidation]] | useRealtime triggers full fetchRides() on every SSE event without debounce — 50k users × 1 event = 50k simultaneous GETs | daily/2026-05-20.md | 2026-05-20 |
| [[concepts/usefilters-trust-filter-noop]] | verifiedOnly/trustMin* declared in state, shown as green badge in UI, but applyFilters() never checks them — silent no-op | daily/2026-05-20.md | 2026-05-20 |
| [[concepts/react-useeffect-memory-leak]] | map.on('moveend') in useEffect without cleanup → handler accumulates on remount, multiple API calls per map move | daily/2026-05-20.md | 2026-05-20 |
| [[concepts/optimistic-update-without-rollback]] | TripCard join optimistic update sets joined=true immediately, no rollback in catch → UI desync if server rejects | daily/2026-05-20.md | 2026-05-20 |
| [[concepts/createride-toctou-saga]] | POST /rides creates template then ride in two separate INSERTs without transaction — crash between them = orphan template | daily/2026-05-20.md | 2026-05-20 |
| [[concepts/postgres-js-listen-once-semantics]] | postgres.js sql.listen() resolves once after PG ACK; reconnect is internal via onclose — while-loop over it = tight infinite loop → crash-loop | daily/2026-05-21.md | 2026-05-21 |
| [[concepts/crash-loop-container-detection]] | `docker ps` short uptime = crash-loop first signal; notifier crash-loop silent for SSE but breaks TG notifications; project name affects container names | daily/2026-05-21.md | 2026-05-21 |
| [[concepts/backup-db-docker-network]] | pg_dump hostname `postgres` only resolves inside Docker network; from host use docker exec; detection-based backup-db.sh for both contexts | daily/2026-05-21.md | 2026-05-21 |
| [[concepts/optimistic-setquerydata-post]] | After POST /rides, use setQueryData with server response to instantly show ride to author; cheaper than invalidateQueries (no extra GET) | daily/2026-05-21.md | 2026-05-21 |
| [[concepts/tanstack-query-semantic-key]] | Query key = intent (preset name), not computed time value; queryFn computes time at request time — prevents fetch-on-every-render | daily/2026-05-22.md | 2026-05-22 |
| [[concepts/cron-startup-vs-scheduled-trap]] | UTCHour guard misses deploy-triggered restarts; fix: remove guard + unconditional startup run + oncePer dedup | daily/2026-05-22.md | 2026-05-22 |
| [[concepts/bulk-insert-transaction-risk]] | 180k INSERTs in one transaction → minutes → lock timeout → full rollback; fix: batch per template/date with idempotent INSERT | daily/2026-05-22.md | 2026-05-22 |
| [[concepts/map-service-zone-bounds]] | Leaflet maxBounds [[55.2,48.3],[56.4,50.2]] + maxBoundsViscosity:1.0 + minZoom:9 ограничивает MapPicker зоной Казань; RouteMapLeaflet non-interactive | daily/2026-05-22.md | 2026-05-22 |
| [[concepts/unnest-batch-update]] | UNNEST для batch UPDATE — N UPDATE в цикле → единый round-trip UPDATE ... FROM UNNEST($1::uuid[], ...); открыто в notificationsRouter (13 UPDATE на категорию) | daily/2026-05-22.md | 2026-05-22 |
| [[concepts/generate-series-expand-templates]] | GENERATE_SERIES заменяет вложенные циклы в expand_templates — единый INSERT...SELECT...GENERATE_SERIES ON CONFLICT DO NOTHING; 180k await'ов → 1 SQL; уникальный частичный индекс rides(template_id, departure_at) | daily/2026-05-22.md | 2026-05-22 |
| [[concepts/enqueue-notification-batch]] | Batch notification dispatch via UNNEST INSERT + pg_notify loop; replaces N round-trips with 1 | daily/2026-05-22.md | 2026-05-22 |
| [[concepts/generate-series-cron-expand]] | Single-SQL cron expand via INSERT...SELECT...GENERATE_SERIES ON CONFLICT DO NOTHING; eliminates 150k async round-trips | daily/2026-05-22.md | 2026-05-22 |
| [[concepts/postgres-js-boolean-array-wire-type]] | postgres.js boolean[] must be cast ::text[]::boolean[] in UNNEST; wire type incompatibility with PostgreSQL boolean[] | daily/2026-05-22.md | 2026-05-22 |
| [[concepts/migration-linux-sort-down-file]] | Linux sorts .down.sql before .sql (ASCII d=100 < s=115); use IF EXISTS/IF NOT EXISTS guards in down files | daily/2026-05-22.md | 2026-05-22 |
