# Build Log

## [2026-05-14T21:30:00+03:00] compile | 2026-05-14.md (sixth pass — corrections)
- Source: daily/2026-05-14.md
- Articles created: [[concepts/leaflet-async-init-test-timing]] (canonical rename from `leaflet-test-async-init`), [[concepts/telegram-swipe-leaflet-conflict]] (duplicate of `telegram-disable-vertical-swipes` — orphan, will be caught by lint)
- Articles updated: [[concepts/css-filter-dark-map-theme]] (added `telegram-swipe-leaflet-conflict` related-concept link; session 20:53 source), [[connections/telegram-webapp-invisible-constraints]] (corrected slug to `telegram-swipe-leaflet-conflict`)
- Index updated: fixed slug `leaflet-test-async-init` → `leaflet-async-init-test-timing`; removed duplicate connections entry; added `telegram-disable-vertical-swipes` row
- Note: Prior fifth-pass article `leaflet-test-async-init` was created with wrong filename slug; corrected here. `telegram-swipe-leaflet-conflict.md` is a duplicate of `telegram-disable-vertical-swipes.md` created before discovering the canonical file existed.

## [2026-05-14T21:05:00+03:00] compile | 2026-05-14.md (fifth pass — session 20:53)
- Source: daily/2026-05-14.md
- Articles created: [[concepts/leaflet-test-async-init]], [[concepts/telegram-disable-vertical-swipes]]
- Articles updated: [[concepts/css-filter-dark-map-theme]] (added brightness/saturate soft-dim variant; user rejected invert as "depressing"), [[connections/telegram-webapp-invisible-constraints]] (added 6th constraint: vertical swipe intercept)

## [2026-05-14T23:59:00+03:00] compile | 2026-05-14.md (fourth pass — non-blocking map pattern)
- Source: daily/2026-05-14.md
- Articles created: [[concepts/non-blocking-map-loading]]
- Articles updated: [[knowledge/index.md]] (added non-blocking-map-loading entry)
- Note: Extracted from session 17:45 (Антон screenshot showing infinite map load). Pattern: show MapContainer immediately, 5s fallback timer for CSP/network failures. Missed by prior passes which focused on Telegram constraints.

## [2026-05-14T20:30:00+03:00] compile | 2026-05-14.md (third pass — full log review)
- Source: daily/2026-05-14.md
- Articles created: (none — all concepts already captured in passes 1 and 2)
- Articles updated: [[concepts/memory-flush-system]] (corrected FLUSH_OK count: 4→5; added timestamps 13:24, 13:28, 16:33, 17:31, 18:22)
- Note: Session 19:54 (squash merge dev→main sprint#8) is operational, no extractable concept. All knowledge from sessions 12:58, 17:11, 17:45, 18:44 already compiled.

## [2026-05-14T22:30:00+03:00] compile | 2026-05-14.md (second pass — sessions 17:45, 18:44)
- Source: daily/2026-05-14.md
- Articles created: [[concepts/csp-tile-provider-telegram]], [[concepts/telegram-mainbutton-dom-conflict]], [[concepts/css-filter-dark-map-theme]], [[connections/telegram-webapp-invisible-constraints]]
- Articles updated: (none)
- Note: First pass compiled sessions 12:58 and 17:11. This pass extracts Telegram WebApp gotchas from sessions 17:45 and 18:44: cartocdn CSP block, MainButton DOM duplication, dark map CSS filter. Connection article synthesizes 5 undocumented Telegram constraints across sessions 2026-05-08 to 2026-05-14.

## [2026-05-14T18:45:00+03:00] compile | 2026-05-14.md
- Source: daily/2026-05-14.md
- Articles created: [[concepts/leaflet-css-zero-height]], [[concepts/test-assertion-contract-drift]], [[concepts/redesign-test-maintenance-cascade]]
- Articles updated: [[concepts/memory-flush-system]] (added 2026-05-14 flush errors: 6 FLUSH_ERRORs + 4 FLUSH_OK; pattern persists 12 days)

## [2026-05-14T18:23:00+03:00] compile | 2026-05-13.md (fourth pass — sessions 20:28, 21:14)
- Source: daily/2026-05-13.md
- Articles created: [[concepts/healthcheck-process-vs-application]], [[concepts/webhook-port-bind-mismatch]], [[concepts/node-pg-migrate-dotenv-docker]], [[concepts/traefik-acme-http01-port80]], [[concepts/vite-api-base-env-var]], [[concepts/telegram-desktop-miniapp-url-cache]], [[concepts/telegram-hashrouter-tgwebappdata]]
- Articles updated: (none)
- Note: 6 articles were listed in index.md from prior passes but never written to disk — created now with full content. 1 new concept extracted from session 21:14 (HashRouter + Telegram hash conflict). vite-api-base-env-var includes centralized apiFetch auto-prefix pattern from session 21:14.

## [2026-05-13T20:56:00+03:00] compile | 2026-05-13.md (third pass)
- Source: daily/2026-05-13.md
- Articles created: [[concepts/deploy-single-healthcheck-window]], [[concepts/trivy-base-image-cve-management]], [[connections/post-deploy-invisible-failures]]
- Articles updated: [[concepts/deployment-pipeline]] (added finding #6: 60s single timeout window for all services → false rollback risk; added deploy-single-healthcheck-window to Related Concepts)
- Index updated: added 9 missing entries (6 from prior passes not indexed: healthcheck-process-vs-application, webhook-port-bind-mismatch, node-pg-migrate-dotenv-docker, traefik-acme-http01-port80, vite-api-base-env-var, telegram-desktop-miniapp-url-cache; 3 new articles)

## [2026-05-13T23:55:00+03:00] compile | 2026-05-13.md (second pass)
- Source: daily/2026-05-13.md
- Articles created: [[concepts/traefik-docker-api-compat]], [[concepts/caddy-alpine-missing-modules]]
- Articles updated: (none — first pass was complete; second pass extracted two additional standalone gotchas)

## [2026-05-13T22:30:00+03:00] compile | 2026-05-13.md
- Source: daily/2026-05-13.md
- Articles created: [[concepts/postgres-custom-config-nullifies-defaults]], [[concepts/pg-isready-tcp-vs-unix-socket]], [[concepts/postgres-volume-init-idempotency]], [[concepts/docker-compose-run-skips-healthcheck]], [[concepts/reactive-deploy-fix-loop]]
- Articles updated: [[concepts/docker-healthcheck-curl]] (caddy:2-alpine also lacks wget; pg_isready TCP vs Unix socket cross-reference), [[concepts/deployment-pipeline]] (Traefik v3.3 API incompatibility → traefik:latest; node-pg-migrate dotenv in Docker; GHCR/docker pull retry; rollback.sh path fix; docker compose run doesn't wait for healthy)

## [2026-05-13T19:22:16+03:00] compile | 2026-05-12.md
- Source: daily/2026-05-12.md
- Articles created: (none — log contained only four FLUSH_OK entries with no extractable content)
- Articles updated: (none)

## [2026-05-13T19:21:44+03:00] compile | 2026-05-11.md
- Source: daily/2026-05-11.md
- Articles created: (none — log contained only two FLUSH_OK entries with no extractable content)
- Articles updated: (none)

## [2026-05-13T19:16:00+03:00] compile | 2026-05-08.md (second pass)
- Source: daily/2026-05-08.md
- Articles created: [[concepts/bun-lockfile-frozen-ci]], [[concepts/ci-workflow-branch-triggers]], [[concepts/x-frame-options-telegram-embedding]], [[concepts/middleware-bodylimit-before-ratelimit]]
- Articles updated: [[concepts/deployment-pipeline]] (DATABASE_MIGRATOR_URL not in deploy pipeline → migration failures; cron cleanup runs as app role → RLS blocks cross-user DELETEs), [[concepts/scope-creep-sentinel]] (added dispatcher method rename gap — REFACTOR renamed methods, caller kept old names, shim removed without updating dispatcher)

## [2026-05-08T20:00:00+03:00] compile | 2026-05-08.md
- Source: daily/2026-05-08.md
- Articles created: [[concepts/docker-healthcheck-curl]], [[concepts/superuser-database-url-rls-bypass]], [[concepts/sse-pool-connection-ceiling]], [[concepts/ci-env-vs-docker-init]], [[concepts/revoke-select-before-rls]], [[concepts/csrf-startswith-prefix-attack]]
- Articles updated: [[concepts/auth-security-vulnerabilities]] (added 2026-05-08 findings: client-errors DoS, rate_limit_buckets no cleanup, bannedUser overly broad scope)

## [2026-05-08T18:30:00+03:00] compile | 2026-05-06.md
- Source: daily/2026-05-06.md
- Articles created: [[concepts/hono-use-vs-handler-chain]], [[concepts/hono-onerror-required]], [[concepts/task-completion-integrity]], [[concepts/vi-fn-undefined-sql-mock]]
- Articles updated: (none)

## [2026-05-08T18:17:35+03:00] compile | 2026-05-05.md
- Source: daily/2026-05-05.md
- Articles created: (none — all 5 memory flushes returned FLUSH_OK with no extractable content)
- Articles updated: (none)

## [2026-05-08T18:14:23+03:00] compile | 2026-05-04.md
- Source: daily/2026-05-04.md
- Articles created: [[concepts/advisory-lock-pool-safety]], [[concepts/on-conflict-constraint-pitfall]]
- Articles updated: [[concepts/postgres-js-isolation-level]] (added native array parameter fact), [[concepts/scope-creep-sentinel]] (added incomplete refactoring pattern — withLock helper created but 4 cron callers left inline), [[concepts/hono-route-prefix-test-mismatch]] (added 2026-05-04 confirmation as recurring systemic pattern)

## [2026-05-08T18:11:31+03:00] compile | 2026-05-03.md (fifth pass)
- Source: daily/2026-05-03.md
- Articles created: [[concepts/auth-security-vulnerabilities]]
- Articles updated: (none)
- Note: Session 11:54 security findings (XFF spoofing, idempotency race, refresh/logout JTI gaps) were not captured in any prior pass — extracted now

## [2026-05-08T18:10:51+03:00] compile | 2026-05-01.md
- Source: daily/2026-05-01.md
- Note: Third compile attempt; all 7 articles already up to date from 2026-05-02T22:43:12+00:00 initial compilation
- Articles created: (none — already existed)
- Articles updated: (none)

## [2026-05-03T23:59:30+03:00] compile | 2026-05-03.md (fourth pass)
- Source: daily/2026-05-03.md
- Articles created: [[concepts/batch-ci-fix-discipline]], [[concepts/truncate-cascade-test-isolation]]
- Articles updated: [[concepts/pre-push-agent-hook]] (hook removed in session 22:30; added status note + source update), [[concepts/hono-route-prefix-test-mismatch]] (added detailed investigation trace from session 19:46: wrong handler matching confirmed, local test run evidence)

## [2026-05-03T23:59:00+03:00] compile | 2026-05-03.md (third pass)
- Source: daily/2026-05-03.md
- Articles created: [[concepts/pre-push-agent-hook]], [[concepts/zod-uuid-strict-validation]]
- Articles updated: [[concepts/c8-ignore-denominator-oscillation]] (added: start/stop does NOT affect V8 function definitions; only `c8 ignore next` on preceding line works for function coverage; inline placement may not be respected)

## [2026-05-03T23:30:00+03:00] compile | 2026-05-03.md (second pass)
- Source: daily/2026-05-03.md
- Articles created: [[concepts/hono-route-prefix-test-mismatch]], [[concepts/c8-ignore-denominator-oscillation]]
- Articles updated: [[concepts/coverage-gate-discipline]] (added cross-reference to c8-ignore-denominator-oscillation)

## [2026-05-03T22:00:00+03:00] compile | 2026-05-03.md
- Source: daily/2026-05-03.md
- Articles created: [[concepts/subagent-git-author]], [[concepts/ci-parallel-jobs]], [[concepts/typescript-type-debt]], [[concepts/coverage-gate-discipline]], [[concepts/postgres-js-isolation-level]], [[concepts/scope-creep-sentinel]], [[concepts/claude-code-auto-compact]], [[connections/scope-creep-and-coverage-gates]]
- Articles updated: [[concepts/memory-flush-system]] (persistent FLUSH_ERROR pattern across 10+ flushes on 2026-05-03; new "Control request timeout: initialize" variant)

## [2026-05-03T18:59:00+03:00] compile | 2026-05-01.md
- Source: daily/2026-05-01.md
- Note: Re-compile request; daily/2026-05-01.md was already fully compiled on 2026-05-02T22:43:12+00:00 — all 7 articles already up to date
- Articles created: (none — already existed)
- Articles updated: (none)

## [2026-05-02T23:10:04+00:00] compile | 2026-05-02.md
- Source: daily/2026-05-02.md
- Note: Log contained no session content — only FLUSH_ERRORs at 22:43 and 23:10 (exit code 1 both times); repeated failure pattern confirms persistent session-level issue
- Articles created: (none)
- Articles updated: [[concepts/memory-flush-system]] (noted second flush error; updated failure description to reflect persistent pattern)

## [2026-05-02T22:45:00+00:00] compile | 2026-05-02.md
- Source: daily/2026-05-02.md
- Note: Log contained no session content — only a FLUSH_ERROR at 22:43 (exit code 1)
- Articles created: [[concepts/memory-flush-system]]
- Articles updated: (none)

## [2026-05-02T22:43:12+00:00] compile | 2026-05-01.md
- Source: daily/2026-05-01.md
- Articles created: [[concepts/poputchiki-stack]], [[concepts/self-hosted-postgres]], [[concepts/rls-guc-identity]], [[concepts/tasks-json-management]], [[concepts/deployment-pipeline]], [[concepts/cyrillic-git-commits]], [[connections/rls-and-self-hosted-postgres]]
- Articles updated: (none — initial compilation)
