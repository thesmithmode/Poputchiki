---
title: "CORS Startup Fail-Fast on Missing DOMAIN Env Var"
aliases: [cors-domain-failsafe, cors-throw-empty-domain, cors-startup-validation, env-failsafe-cors]
tags: [security, backend, cors, configuration, pattern]
sources:
  - "daily/2026-05-15.md"
created: 2026-05-15
updated: 2026-05-15
---

# CORS Startup Fail-Fast on Missing DOMAIN Env Var

CORS middleware that dynamically constructs the allowed origin from a `DOMAIN` environment variable must throw at startup (not at request time) when `DOMAIN` is empty or missing. Failing silently with an empty origin allows all cross-origin requests or produces unpredictable behavior; throwing at startup forces the operator to fix the configuration before the service handles any traffic.

## Key Points

- `DOMAIN=""` in a CORS check like `origin === \`https://app.${DOMAIN}\`` evaluates to `origin === "https://app."` — never matches any real request → effectively blocks all legitimate cross-origin traffic
- Or worse: if the check uses `startsWith`, an empty domain string could match unintended origins
- Correct pattern: validate `DOMAIN` at module initialization time, throw `Error("DOMAIN env var is required")` before registering any middleware
- Startup throw is caught by the process supervisor (Docker, PM2) and surfaces in logs immediately — far better than a runtime mystery 403 from valid requests
- Same pattern applies to any security-critical env var: `JWT_SECRET`, `BOT_TOKEN`, `PGCRYPTO_KEY`

## Details

CORS (Cross-Origin Resource Sharing) is the browser mechanism that restricts which origins can make cross-origin requests to an API. The Poputchiki API allows requests from `https://app.${DOMAIN}` — the frontend subdomain. If `DOMAIN` is not set (empty string, undefined, or missing from the Docker environment), the constructed allowed-origin string becomes malformed.

The failure mode depends on the CORS middleware implementation:
- **Exact match**: `origin === "https://app."` → never matches → every CORS preflight fails → frontend cannot call the API
- **Includes/startsWith**: may match unexpected domains → security bypass

Both are worse than a clear startup error.

Correct implementation:

```typescript
// env.ts — validated at module load
const DOMAIN = process.env.DOMAIN;
if (!DOMAIN) throw new Error("DOMAIN env var is required — cannot configure CORS");

// cors.ts
export const corsMiddleware = cors({
  origin: (origin) => {
    const allowed = new Set([
      `https://app.${DOMAIN}`,
      `https://${DOMAIN}`,
    ]);
    return allowed.has(origin) ? origin : null;
  },
  credentials: true,
});
```

The `throw` in `env.ts` fires during module initialization, before Hono registers any route or middleware. The process exits immediately with a non-zero code. Docker marks the container as crashed and logs the error. The operator sees `Error: DOMAIN env var is required` in `docker logs` and fixes the environment. No request is ever handled with broken CORS.

The same fail-fast principle applies to all security-critical configuration:
- `JWT_SECRET` — without it, all JWTs are either unverifiable or signed with an empty key
- `BOT_TOKEN` — without it, webhook signature verification fails open or closed
- `PGCRYPTO_KEY` — without it, PII encryption/decryption fails at the DB function level

The validation should be as early as possible in the startup path — before any `async` operations or external connections — so startup failure is fast and diagnostic messages are the first output.

## Related Concepts

- [[concepts/csrf-startswith-prefix-attack]] — CORS origin validation uses the same allowlist pattern (`Set.has`) as CSRF origin check; both must avoid `startsWith` and must validate at startup
- [[concepts/auth-security-vulnerabilities]] — Security misconfigurations (empty domain, wrong CORS) create the same class of risk as auth code bugs; fail-fast prevents silent misconfiguration
- [[concepts/deployment-pipeline]] — Docker Compose `environment:` section is where `DOMAIN` must be set; missing value surfaces immediately on `docker compose up` with fail-fast validation

## Sources

- [[daily/2026-05-15.md]] — Session 12:08: code review finding MED-9 — CORS middleware did not throw on empty `DOMAIN`; fix: validate `DOMAIN` at startup, throw `Error` before any middleware registration; same pattern recommended for all security-critical env vars
