---
title: "Vite API Base URL — Hardcoded /api Breaks Subdomain Routing"
aliases: [vite-api-base, apifetch-hardcoded, api-base-env, apifetch-prefix, centralized-api-prefix]
tags: [frontend, vite, deployment, gotcha, configuration]
sources:
  - "daily/2026-05-13.md"
created: 2026-05-13
updated: 2026-05-13
---

# Vite API Base URL — Hardcoded /api Breaks Subdomain Routing

Hardcoding `/api` as a path prefix in the frontend `apiFetch` utility breaks when the API lives on a separate subdomain (`api.domain.com`). Relative URL `/api/users/me` resolves to `app.domain.com/api/users/me` (the frontend's origin), not the API server. The fix is `import.meta.env.VITE_API_BASE` set at build time via Docker build ARG.

## Key Points

- `apiFetch("/api${path}")` → relative URL → browser resolves against current origin (`app.domain.com`) → hits Caddy (frontend server) → gets `index.html` back → JSON parse fails
- `VITE_API_BASE` must be an absolute URL: `https://api.poputchiki.searchingforgamesforever.online`
- Passed as Docker build ARG → Vite inlines at build time → available via `import.meta.env.VITE_API_BASE`
- Biome linter does not understand Vite's `ImportMetaEnv` interface augmentation → requires `biome-ignore` on the interface declaration
- The error manifests as `null` response or `SyntaxError: Unexpected token '<'` (HTML parsed as JSON)

## Details

The Poputchiki frontend uses a centralized `apiFetch` utility for all API calls. The original implementation prepended `/api` to every path:

```typescript
// WRONG: hardcoded relative prefix
export async function apiFetch(path: string) {
  const res = await fetch(`/api${path}`, { ... });
  return res.json();
}
```

In the subdomain routing architecture (`app.domain.com` serves frontend, `api.domain.com` serves API), the relative URL `/api/users/me` resolves to `https://app.domain.com/api/users/me`. Caddy (the frontend server) receives this request, finds no matching route, and returns `index.html` (SPA fallback). The frontend then attempts to parse HTML as JSON, producing either `null` or a `SyntaxError`.

The correct implementation uses `VITE_API_BASE`:

```typescript
// CORRECT: absolute URL from env var
const API_BASE = import.meta.env.VITE_API_BASE || "";

export async function apiFetch(path: string) {
  const res = await fetch(`${API_BASE}${path}`, { ... });
  return res.json();
}
```

### Centralized Auto-Prefix Pattern (Session 21:14 Fix)

After fixing the base URL, a secondary issue emerged: 12+ files throughout the frontend used bare paths like `/geocode/search`, `/rides`, `/users/me`. Instead of editing every caller, the solution was to add automatic `/api` prefix logic inside `apiFetch` for non-auth routes:

```typescript
export async function apiFetch(path: string) {
  // Auth routes go to /auth/* directly; all others get /api prefix
  const fullPath = path.startsWith("/auth/") ? path : `/api${path}`;
  const res = await fetch(`${API_BASE}${fullPath}`, { ... });
  return res.json();
}
```

This centralized approach changed one file instead of twelve, reducing error surface and keeping callers clean. Auth routes (`/auth/telegram`, `/auth/refresh`, `/auth/logout`) skip the prefix because the API mounts them at the root.

### Build Pipeline

```dockerfile
# Dockerfile
ARG VITE_API_BASE
ENV VITE_API_BASE=${VITE_API_BASE}
RUN bun run build
```

```yaml
# docker-compose.prod.yml or GHA workflow
build:
  args:
    VITE_API_BASE: https://api.poputchiki.searchingforgamesforever.online
```

The failure is invisible to server-side smoke tests because `curl http://api.domain.com/health` works fine — it tests the API directly. The broken path only manifests in the browser where the frontend's origin differs from the API's origin.

## Related Concepts

- [[connections/post-deploy-invisible-failures]] - Hardcoded API path is one of three post-deploy invisible failures: server healthy but frontend broken
- [[concepts/telegram-desktop-miniapp-url-cache]] - Co-occurring failure: Telegram caches old URL while frontend caches wrong API path
- [[concepts/deployment-pipeline]] - Build ARG must be threaded through the Docker build pipeline

## Sources

- [[daily/2026-05-13.md]] - Session 20:28: `apiFetch` hardcoded `/api` → hits Caddy instead of API subdomain → null/HTML response; fix: `import.meta.env.VITE_API_BASE` from Docker build ARG
- [[daily/2026-05-13.md]] - Session 21:14: centralized auto `/api` prefix in apiFetch for non-auth routes → one file change instead of 12+; auth routes excluded from prefix
