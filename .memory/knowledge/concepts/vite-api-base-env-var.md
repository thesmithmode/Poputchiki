---
title: "VITE_API_BASE Env Var — Never Hardcode API Path in Frontend"
aliases: [vite-api-base, apiFetch-hardcoded, frontend-api-url, vite-build-arg]
tags: [frontend, vite, react, deployment, gotcha, architecture]
sources:
  - "daily/2026-05-13.md"
created: 2026-05-13
updated: 2026-05-13
---

# VITE_API_BASE Env Var — Never Hardcode API Path in Frontend

Hardcoding `/api` as a relative path in frontend fetch utilities breaks when the API is hosted on a separate subdomain (e.g., `api.app.example.com`). `VITE_API_BASE` must be injected as a build arg and consumed via `import.meta.env.VITE_API_BASE` — passing it as a GHA Docker build arg is not sufficient if the code doesn't reference the variable.

## Key Points

- `apiFetch(path)` that constructs `"/api" + path` sends requests to the web server's own origin, not the API subdomain
- In subdomain routing (`api.domain.com` separate from `app.domain.com`), relative `/api` hits Caddy → 404 or returns `index.html` → JSON.parse fails → null → TypeError
- `VITE_API_BASE` must be in `import.meta.env.VITE_API_BASE` — Vite replaces env vars at build time
- Passing `--build-arg VITE_API_BASE=...` to `docker build` works only if the Dockerfile has `ARG VITE_API_BASE` and the code uses `import.meta.env.VITE_API_BASE`
- Symptom: all API calls fail with "Failed to fetch" or produce empty/null responses; network tab shows requests to `app.domain.com/api/...` instead of `api.domain.com/...`

## Details

Vite replaces `import.meta.env.VITE_*` variables at build time. The replacement happens when `vite build` runs — if `VITE_API_BASE` is not set during the build step, the variable is undefined and falls back to empty string or causes a runtime error. GHA passes build args to `docker build`, which must have a corresponding `ARG VITE_API_BASE` instruction in the Dockerfile for the value to be available to the `bun run build` step inside the container.

In Poputchiki on 2026-05-13, `VITE_API_BASE` was correctly passed through GHA → Docker build arg → Dockerfile ARG → environment. However, `web/src/lib/api.ts` contained:

```typescript
// WRONG: hardcoded relative path
const apiFetch = (path: string) => fetch(`/api${path}`, ...);
```

The correct implementation:

```typescript
// CORRECT: env var from Vite build
const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";
const apiFetch = (path: string) => fetch(`${API_BASE}${path}`, ...);
```

The failure mode is subtle: requests to `/api/users/me` are sent to `https://app.poputchiki.domain/api/users/me`. Caddy (the web server) receives this request, finds no match in its config for `/api/*`, and either returns a 404 or serves `index.html` (if configured as SPA fallback). When the frontend tries to `response.json()` on an HTML document, the parse fails. Depending on error handling, this surfaces as "Failed to fetch", null, or a cryptic TypeError — not as an obvious "wrong server" error.

**Checklist for subdomain API routing:**
1. `web/src/lib/api.ts`: uses `import.meta.env.VITE_API_BASE`, not hardcoded string
2. `.env.production` or `.env.example`: `VITE_API_BASE=https://api.domain.com`
3. `Dockerfile` (web): `ARG VITE_API_BASE` before `RUN bun run build`
4. `docker-compose.prod.yml` build section: `args: { VITE_API_BASE: "https://api.${DOMAIN}" }`
5. GHA workflow: GitHub Secret `VITE_API_BASE` set, passed to docker build

An alternative architecture is path-based routing (`/api/` prefix handled by Caddy reverse proxy to the API service) rather than subdomain routing. This eliminates the VITE_API_BASE requirement entirely — `apiFetch("/api/users/me")` works correctly because Caddy proxies it to the API container. Subdomain routing is more scalable but adds this build-time configuration burden.

## Related Concepts

- [[concepts/deployment-pipeline]] — Build args for frontend are part of the GHA → GHCR → deploy pipeline; missing args silently produce broken builds
- [[concepts/traefik-acme-http01-port80]] — Co-occurring production failure on the same day: HTTPS broken prevented testing the VITE_API_BASE fix until certs were issued
- [[concepts/reactive-deploy-fix-loop]] — Hardcoded API path is the type of static issue detectable via code audit before deploying; part of the pre-deploy checklist (compare compose env vars against app env schemas)

## Sources

- [[daily/2026-05-13.md]] — Session 20:28: `apiFetch` in `web/src/lib/api.ts` used hardcoded `/api${path}`; in subdomain architecture, requests went to Caddy → 404/index.html → JSON parse fail → null → TypeError; fix: use `import.meta.env.VITE_API_BASE`; BACKLOG item added for evaluating path-based routing instead of subdomain routing
