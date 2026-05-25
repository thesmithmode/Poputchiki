# Build Log

## [2026-05-24T23:59:00] compile | daily/2026-05-24.md (pass 6 — Session 23:21 loading screen singleton)
- Source: daily/2026-05-24.md
- Articles created: [[concepts/loading-screen-singleton-mecontext]]
- Articles updated: [[knowledge/index.md]] (+1 entry)
- Key concepts captured: useBootMe singleton, MeContext separate file, vi.mock module replacement gotcha, RidesScreen non-lazy, usePrefetchScreens MODE=test guard, regular merge for diverged branches

## [2026-05-24T22:14:00] compile | Daily Log 2026-05-24
- Source: daily/2026-05-24.md
- Articles created: [[concepts/onboarding-is-onboarded-flag]]
- Articles updated: [[concepts/coverage-gate-discipline]] (new endpoint → immediate tests rule; response body contract lesson), [[concepts/tanstack-query-semantic-key]] (staleTime 60s→20s tuning, useRide staleTime:0)
- Note: [[concepts/stale-ride-feed-ux-trap]], [[concepts/feed-freshness-indicator]], [[concepts/sse-named-events-onmessage-gap]], [[concepts/notifier-api-sse-bridge]] were compiled in a prior pass from the same daily log

## [2026-05-25T01:00:00+03:00] compile | daily/2026-05-24.md (pass 5 — Session 21:25 SSE concepts)
- Source: daily/2026-05-24.md
- Articles created: sse-named-events-onmessage-gap.md, notifier-api-sse-bridge.md
- Articles updated: (none)
- Note: Предыдущие 4 прохода покрывали сессию 18:40 (staleTime/feed). Сессия 21:25 (TASK-111..125, SSE broadcast) не была скомпилирована. Два новых концепта: EventSource.onmessage silent-fail для named events; cross-process SSE bridge через internal HTTP endpoint.

## [2026-05-25T00:10:00+03:00] compile | daily/2026-05-24.md (pass 4 — context-restore re-check)
- Source: daily/2026-05-24.md
- Articles created: (none)
- Articles updated: (none — все концепты скомпилированы в предыдущих 3 проходах)
- Note: После восстановления контекста сессии повторно проверены log.md и существующие статьи. Подтверждено: stale-ride-feed-ux-trap.md, feed-freshness-indicator.md, tanstack-query-semantic-key.md полностью покрывают знания из 2026-05-24.

## [2026-05-24T23:59:00+03:00] compile | daily/2026-05-24.md (pass 3 — verification)
- Source: daily/2026-05-24.md
- Articles created: (none)
- Articles updated: (none — все концепты уже скомпилированы в pass 1 и pass 2)
- Note: Полный проход подтвердил: concepts/stale-ride-feed-ux-trap.md, concepts/feed-freshness-indicator.md, concepts/tanstack-query-semantic-key.md покрывают все знания из 2026-05-24. Индекс актуален.

## [2026-05-24T23:30:00+03:00] compile | daily/2026-05-24.md (pass 2 — article rewrite)
- Source: daily/2026-05-24.md
- Articles created: (none — статьи уже существовали как стабы)
- Articles updated: concepts/stale-ride-feed-ux-trap.md (полный рерайт: AGENTS.md frontmatter + Key Points + Details 2 абз. + Related Concepts), concepts/feed-freshness-indicator.md (полный рерайт: аналогично)
- Index: без изменений (Updated даты уже 2026-05-24)
- Note: Оба стаба имели нестандартный frontmatter (name/description/type вместо title/aliases/tags/sources/created/updated); конвертированы в полноценные статьи по схеме AGENTS.md

## [2026-05-24T22:00:00+03:00] compile | daily/2026-05-24.md
- Source: daily/2026-05-24.md
- Articles created: concepts/stale-ride-feed-ux-trap.md, concepts/feed-freshness-indicator.md
- Articles updated: concepts/tanstack-query-semantic-key.md (staleTime tuning + safety rationale)
- Index: +2 rows
- Note: Session 18:40 — autoresearch остановлен (proxy metrics < 2%), staleTime 60s→20s для ленты, useRide всегда fresh, feed freshness indicator

## [2026-05-24T00:45:00+03:00] compile | daily/2026-05-23.md
- Source: daily/2026-05-23.md
- Articles created: (none)
- Articles updated: (none)
- Note: Пустая сессия — все 3 memory flush вернули FLUSH_OK без контента

## [2026-05-24T00:30:00+03:00] compile | daily/2026-05-22.md (pass final — session 19:20 + library-package-no-console)
- Source: daily/2026-05-22.md
- Articles created: [[concepts/library-package-no-console]]
- Articles updated: (none — все остальные концепции сессии 19:20 покрыты существующими статьями: unnest-multi-column-alias, tanstack-query-semantic-key, advisory-lock-pool-safety)
- Notes: Единственный новый концепт из полного прохода daily/2026-05-22.md — TypeScript lib packages не могут использовать console.* (нет DOM lib); симптом: TS2304 Cannot find name 'console' в packages/shared; фикс: убрать try-catch из library, логирование на call-site в apps/

## [2026-05-24T00:00:00+03:00] compile | daily/2026-05-22 (1).md
- Source: daily/2026-05-22 (1).md
- Articles created: (нет)
- Articles updated: (нет)
- Notes: Файл является дублем/переполнением того же дня что и daily/2026-05-22.md. Все сессии (17:11, 17:49, 18:05, 18:15, 18:35) уже скомпилированы в предыдущих проходах. Все концепции покрыты существующими статьями: map-service-zone-bounds, cron-startup-vs-scheduled-trap, bulk-insert-transaction-risk, generate-series-expand-templates, generate-series-cron-expand, tanstack-query-semantic-key, enqueue-notification-batch, unnest-batch-update, postgres-js-boolean-array-wire-type, migration-linux-sort-down-file.

## [2026-05-22T18:35:47+03:00] compile | 2026-05-22.md (pass final — session 18:35)
- Source: daily/2026-05-22.md
- Articles created: [[concepts/postgres-js-boolean-array-wire-type]], [[concepts/migration-linux-sort-down-file]]
- Articles updated: (none — все статьи сессий 17:11–18:15 уже имели источник daily/2026-05-22.md из предыдущих компиляций)
- Notes: Session 18:35 — два CI-инцидента: (1) UNNEST boolean[] wire type — postgres.js кодирует boolean не через text-путь PostgreSQL; ::text[]::boolean[] double-cast обязателен для всех boolean-параметров в UNNEST (commit 2b9f8b8); (2) Linux sort order — .down.sql < .sql по ASCII (d=100 < s=115) → down-файл бежал первым как "up" миграция; фикс: IF NOT EXISTS / IF EXISTS в DDL down-файлов (commit e05104d)

## [2026-05-22T18:30:00] compile | Daily Log 2026-05-22
- Source: daily/2026-05-22.md
- Articles created: [[concepts/enqueue-notification-batch]], [[concepts/generate-series-cron-expand]]
- Articles updated: [[concepts/enqueue-notification-helper]] (added enqueueNotificationBatch reference — already present from prior session), [[concepts/bulk-insert-transaction-risk]] (added implemented solution note — already present from prior session)
- Notes: enqueue-notification-batch.md и generate-series-cron-expand.md — новые canonical-статьи для commits 35a1f60 и 31f82ea; unnest-batch-update.md и generate-series-expand-templates.md существовали с предыдущей компиляции; в index добавлены все 4 slugs

## [2026-05-22T18:23:00+03:00] compile | daily/2026-05-22.md
- Source: daily/2026-05-22.md
- Articles created: [[concepts/unnest-batch-update]], [[concepts/generate-series-expand-templates]]
- Articles updated: [[concepts/enqueue-notification-helper]] (enqueueNotificationBatch variant — UNNEST INSERT для batch-вставки нескольким получателям; pg_notify цикл оправдан как lightweight), [[concepts/bulk-insert-transaction-risk]] (GENERATE_SERIES single-SQL solution — финальное решение вместо батчинга по шаблону/дате; уникальный частичный индекс миграция 033)

## [2026-05-22T23:00:00+03:00] compile | 2026-05-22.md (pass 2)
- Source: daily/2026-05-22.md
- Articles created: [[concepts/map-service-zone-bounds]]
- Notes: Сессия 17:11 — Leaflet maxBounds для ограничения MapPicker зоной Казань. Bbox [[55.2,48.3],[56.4,50.2]], maxBoundsViscosity:1.0 (жёсткий bounce), minZoom:9. RouteMapLeaflet полностью non-interactive.

## [2026-05-22T20:00:00+03:00] compile | 2026-05-22.md
- Source: daily/2026-05-22.md
- Articles created: [[concepts/tanstack-query-semantic-key]], [[concepts/cron-startup-vs-scheduled-trap]], [[concepts/bulk-insert-transaction-risk]]
- Articles updated: [[concepts/advisory-lock-pool-safety]] (добавлен раздел "Silent hole: winner crashes before completion" — если winner упал до commit, второй инстанс уже вышел, результат 0 записей до следующего scheduled run; добавлен источник daily/2026-05-22.md)
- Notes: Сессия 2026-05-22. Три основных паттерна: (1) TanStack Query semantic key — query key должен отражать намерение (пресет), не вычисленное время; resolveDateRange() → new Date().toISOString() внутри key → fetch на каждом рендере → mock израсходован в тестах; (2) UTCHour guard trap — guard при 3:00 UTC блокирует запуск при деплое → поездки не создаются до следующего дня; фикс: убрать guard, oncePer + безусловный startup run; (3) Bulk INSERT risk — 180k INSERTs в одной транзакции = минуты = full rollback при lock timeout/connection drop; нужен батчинг по шаблону/дате с идемпотентным INSERT.

## [2026-05-22T00:00:00+03:00] compile | 2026-05-21.md
- Source: daily/2026-05-21.md
- Articles created: [[concepts/postgres-js-listen-once-semantics]], [[concepts/crash-loop-container-detection]], [[concepts/backup-db-docker-network]], [[concepts/optimistic-setquerydata-post]]
- Articles updated: [[concepts/pg-listen-reconnect-loop]] (добавлен раздел о postgres.js исключении: sql.listen() резолвится после ACK, not after disconnect; reconnect loop поверх него = crash-loop; commit 9a6a184 инцидент; добавлен источник daily/2026-05-21.md), [[concepts/deployment-pipeline]] (добавлены findings #7 и #8: verify-ci должен проверять HEAD SHA dev-ветки не parent SHA squash-коммита в main; backup-db.sh pg_dump hostname postgres недоступен с хоста → docker exec; добавлен источник daily/2026-05-21.md)
- Notes: Сессия 2026-05-21. Три основных инцидента: (1) crash-loop notifier из-за неправильного reconnect wrapper поверх sql.listen() — postgres.js резолвит после ACK, not disconnect; (2) backup-db.sh ломался с хоста — hostname postgres DNS только внутри Docker-сети; (3) verify-ci SHA mismatch — проверял parent SHA squash-коммита в main вместо HEAD SHA dev. Также: оптимистичный setQueryData после POST /rides для мгновенного фида автора без лишнего GET.

## [2026-05-20T23:30:00+03:00] compile | 2026-05-20.md (session 19:54 pass 3 — frontend + api deep)
- Source: daily/2026-05-20.md
- Articles created: [[concepts/usefilters-trust-filter-noop]], [[concepts/react-useeffect-memory-leak]], [[concepts/optimistic-update-without-rollback]], [[concepts/createride-toctou-saga]]
- Articles updated: [[concepts/auth-security-vulnerabilities]] (HMAC timing attack via === instead of timingSafeEqual; logout JTI atomicity gap without transaction)
- Notes: Third pass of same log. Uncompiled findings from web/api sectors: trust filter fields silent no-op (useFilters applyFilters() ignores verifiedOnly/trustMin*), Leaflet event handler accumulation (map.on without cleanup), optimistic update without rollback (TripCard join), createRide two-step INSERT without transaction (orphan template on crash). Plus two security findings added to auth-security-vulnerabilities: HMAC timing side-channel (50k RPM exploitable), logout JTI revocation atomicity gap.

## [2026-05-20T22:15:00+03:00] compile | 2026-05-20.md (session 19:54 detailed review)
- Source: daily/2026-05-20.md
- Articles created: [[concepts/jwt-refresh-race-condition]], [[concepts/sse-broadcast-backpressure]], [[concepts/postgres-stable-volatile-encryption]], [[concepts/force-row-level-security]], [[concepts/n-plus-one-sse-invalidation]]
- Articles updated: (none)
- Notes: Session 19:54 — full agent reports from 5 sectors (api-C1..C6, web-C1..C5, infra-C1..C5, shared-db-C1..C5, shared-pkg-C1..C3). 24C/46H/59M/23L total findings. New concepts: JWT refresh race condition (concurrent 401 → multiple valid tokens), SSE broadcast backpressure (sequential for-await blocks event loop at 50k), STABLE volatility on encrypt_pii (planner caches ciphertexts = ECB at SQL layer; distinct from app-layer static IV already compiled), FORCE ROW LEVEL SECURITY missing on revoked_tokens/users/rides (owner bypass hole), N+1 SSE invalidation (useRealtime triggers full fetchRides on every event without debounce)

## [2026-05-20T21:30:00+03:00] compile | 2026-05-20.md (session 19:45 update)
- Source: daily/2026-05-20.md
- Articles created: [[concepts/encryptpii-static-iv]], [[concepts/location-history-partitioning]], [[concepts/deploy-sh-set-e]], [[concepts/atomic-update-race-condition]], [[concepts/pg-listen-reconnect-loop]], [[concepts/userpublic-userinternal-pii]]
- Articles updated: [[concepts/rls-guc-identity]] (set_config false vs true — GUC leaks identity across pooled connections)
- Notes: Session 19:45 — 5 parallel sector code reviews (API/WEB/INFRA/DB/SHARED). Key findings: static IV в encryptPII (ECB-like attack), joinTrip atomic update race → overbooking, PG LISTEN нет reconnect → SSE падает навсегда, location_history 864M rows/day без партиционирования, deploy.sh без set -e → silent migration fail, UserPublic/UserInternal split для предотвращения PII leak через API response, GUC set_config(false) не сбрасывается после транзакции → утечка identity через connection pool

## [2026-05-20T19:44:00+03:00] compile | 2026-05-20.md
- Source: daily/2026-05-20.md
- Articles created: (none)
- Articles updated: (none)
- Notes: Log содержит только FLUSH_OK×2 («Nothing worth saving») и FLUSH_ERROR×1. Новых концептов нет.

## [2026-05-20T20:30:00+03:00] compile | 2026-05-19.md
- Source: daily/2026-05-19.md
- Articles created: [[concepts/notifier-service-role-rls]], [[concepts/telegram-webview-in-memory-cache]], [[concepts/from-to-coordinate-validation]], [[concepts/telegram-webhook-internal-api]], [[concepts/leaflet-divicon-xss]], [[concepts/cache-bust-version-json]]
- Articles updated: [[concepts/notification-category-drift]] (CHECK constraint requirement for new categories)
- Orphan duplicates created (pre-collision detection): [[concepts/tg-webview-inprocess-cache]] (dup of telegram-webview-in-memory-cache), [[concepts/coordinate-same-location-validation]] (dup of from-to-coordinate-validation)
- Notes: Key sessions: 12:45 (notifier RLS trap — getRecipient silent 0 rows, migration 027 service-role policies), 14:05 (ride_completed category + migration 028 CHECK constraint), 14:44 (TG WebView in-memory cache diagnosis, from/to 50m validation, TG callback internal API double root cause, divIcon XSS, cache-bust version.json mechanism)

## [2026-05-20T20:10:00+03:00] compile | 2026-05-18.md
- Source: daily/2026-05-18.md
- Articles created: [[concepts/enqueue-notification-helper]], [[concepts/pg-notify-missing-user-notifications]], [[concepts/telegram-bot-403-notify-disabled]], [[concepts/notification-category-drift]]
- Articles updated: [[concepts/fire-and-forget-sql-mock]] (enqueueNotification mock-order note)
- Notes: Key sessions: 14:33 (Phase 1 notification audit — 11 root causes, TG bot 403, category drift), 15:01 (enqueueNotification helper in packages/shared, 11 call sites replaced), 16:26 (SSH prod psql check), 16:42 (EventsScreen redesign)

## [2026-05-20T19:45:00+03:00] compile | 2026-05-17.md (second pass)
- Source: daily/2026-05-17.md
- Articles created: [[concepts/react-lazy-screen-splitting]]
- Articles updated: (none)
- Notes: First pass (19:40) captured 4 concepts. This pass extracts the missed performance pattern from session 13:38: React.lazy for MapScreen (Leaflet), EventsScreen, and other heavy screens to reduce initial bundle parse time in Telegram MiniApp WebView.

## [2026-05-20T19:40:00+03:00] compile | 2026-05-17.md
- Source: daily/2026-05-17.md
- Articles created: [[concepts/book-seat-on-accept-not-request]], [[concepts/fire-and-forget-sql-mock]], [[concepts/pg-notify-single-channel]], [[concepts/localstorage-key-constants-in-tests]]
- Articles updated: (none)
- Notes: All 4 articles already existed on disk (untracked git files from prior compilation). Key sessions: 12:12 (book_seat placement bug + missing PATCH endpoint), 14:04 (fire-and-forget mock discipline + localStorage key constant drift), 15:04 (pg_notify channel standardisation to notify_user)

## [2026-05-20T19:35:00+03:00] compile | 2026-05-16.md
- Source: daily/2026-05-16.md
- Articles created: [[concepts/sess-bind-jwt-session-fixation]], [[concepts/theme-css-semantic-tokens]], [[concepts/docker-compose-profiles-silent-skip]], [[concepts/nominatim-pbf-region-sizing]]
- Articles updated: [[concepts/useme-auth-flow]] (added JWT.sub vs Telegram.initDataUnsafe.user.id mount check from session 12:31)
- Notes: All 4 new articles existed on disk (untracked git files) — index and log were the only missing pieces. Key sessions: 12:31 (sess_bind auth refactor), 14:50–15:12 (theme CSS token architecture), 15:43 (Nominatim profiles trap + PBF sizing)

## [2026-05-20T19:28:00+03:00] compile | 2026-05-15.md (second pass — full article creation)
- Source: daily/2026-05-15.md
- Articles created: [[concepts/apifetch-centralized-401-refresh]], [[concepts/banned-user-cache-invalidation]], [[concepts/cors-startup-failsafe]], [[concepts/frontend-api-error-graceful-fallback]]
- Articles updated: (none — new articles only)
- Notes: apifetch and banned-user articles existed in index but had no file; created full content; 2 new concepts added for CORS fail-fast and geocode error fallback

## [2026-05-20T19:05:54+03:00] compile | 2026-05-15.md
- Source: daily/2026-05-15.md
- Articles created: [[concepts/apifetch-centralized-401-refresh]], [[concepts/banned-user-cache-invalidation]]
- Articles updated: [[concepts/useme-auth-flow]] (added architecture update note: 401 refresh moved to apiFetch; added related concept link and source), [[concepts/memory-flush-system]] (added 2026-05-15 flush error at 11:22)

## [2026-05-20T19:02:45+03:00] compile | 2026-05-14.md (seventh pass — index repair)
- Source: daily/2026-05-14.md
- Articles created: (none)
- Articles updated: (none)
- Index updated: added missing `[[concepts/useme-auth-flow]]` entry — file existed on disk from session 12:58 compilation but was never added to index.md in any of the six prior passes

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
