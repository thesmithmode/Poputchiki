---
title: "Connection: Post-Deploy Invisible Failures (Server Up, App Broken)"
connects:
  - "concepts/telegram-desktop-miniapp-url-cache"
  - "concepts/vite-api-base-env-var"
  - "concepts/traefik-acme-http01-port80"
sources:
  - "daily/2026-05-13.md"
created: 2026-05-13
updated: 2026-05-13
---

# Connection: Post-Deploy Invisible Failures (Server Up, App Broken)

## The Connection

Three distinct failure modes share a single pattern: deployment infrastructure reports success (containers healthy, smoke tests pass at the server level), but the application is completely broken from the user's perspective. Each failure is invisible to standard healthcheck-based smoke tests.

## Key Insight

Server-side health checks test server availability, not end-to-end user experience. In the Poputchiki production deployment on 2026-05-13, all three failures occurred in sequence and were only discovered by a human clicking through the app:

1. **Telegram Desktop URL caching** — BotFather URL updated, server deployed successfully, Telegram Desktop still shows the old URL. All containers healthy; user cannot open the new app.

2. **Hardcoded API path** — Frontend deployed with `apiFetch("/api${path}")` instead of `import.meta.env.VITE_API_BASE`. All containers healthy, web server responds on port 80/443; all API calls fail with "Failed to fetch" because they hit Caddy instead of the API subdomain.

3. **ACME TLS failure** — Traefik healthy, all containers healthy, HTTP health endpoint returns 200 — but HTTPS is broken because `acme.json` is empty (port 80 was blocked by iptables). All production traffic uses HTTPS; users get SSL errors.

The failures were layered: fixing client caching revealed the API path problem, fixing the API path revealed the HTTPS problem. Standard smoke tests would have passed at each stage.

## The Complete Post-Deploy Verification Checklist

Standard smoke test (server-side curl to healthcheck endpoint) is necessary but not sufficient. The complete check must include:

| Check | Scope | Command |
|-------|-------|---------|
| Server availability | Server-side | `curl http://api.domain.com/health` |
| HTTPS termination | Network + TLS | `curl -v https://api.domain.com/health` |
| Certificate validity | TLS | `curl -vI https://api.domain.com` (check cert expiry) |
| `acme.json` non-empty | Traefik config | `stat -c %s acme.json` (size > 2 = has cert) |
| Frontend reaches API | End-to-end | Browser Network tab: request goes to `api.domain.com`, not `app.domain.com/api` |
| Client config fresh | Client-side | Manual check: open fresh Telegram / clear browser cache |

## Evidence

All three failures occurred in a single session on 2026-05-13. The debug sequence took ~90 minutes:

1. Deploy reported success (run `25818499090`, smoke tests passed) → Telegram Desktop showed old Mini App URL (cache issue)
2. Forced full Telegram Desktop restart → App opened but `users/me` returned "Failed to fetch" (hardcoded `/api` in apiFetch)
3. Fixed `VITE_API_BASE`, redeployed → HTTPS connection failure, SSL error (acme.json empty, port 80 blocked by iptables)
4. Opened port 80 (`iptables -I INPUT -p tcp --dport 80 -j ACCEPT`), restarted Traefik → 4 TLS certificates issued in 2 minutes → app fully functional

Each stage passed server-side health checks. Only the final end-to-end user experience revealed the full failure chain.

## Related Concepts

- [[concepts/telegram-desktop-miniapp-url-cache]] - Client-side URL cache hiding deployment changes from the user
- [[concepts/vite-api-base-env-var]] - Frontend build-time API URL hardcoding that passes all server-side checks
- [[concepts/traefik-acme-http01-port80]] - Server-side TLS configuration failure invisible to HTTP health checks
- [[concepts/reactive-deploy-fix-loop]] - The same debug session; each fix revealed the next layer of failure; a comprehensive pre-deploy audit would have caught all three
- [[concepts/deployment-pipeline]] - Smoke test step in deploy.sh that should be extended to cover end-to-end verification

## Sources

- [[daily/2026-05-13.md]] - Session 20:28: three sequential post-deploy invisible failures discovered by manual app testing; all containers reported healthy throughout; each failure required a separate fix; pattern: server-side health checks insufficient for user-visible correctness
