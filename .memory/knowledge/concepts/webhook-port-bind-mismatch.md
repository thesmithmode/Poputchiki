---
title: "Webhook Port Bind Mismatch — Code vs Infrastructure Config"
aliases: [webhook-port-mismatch, port-bind-mismatch, container-unhealthy-port]
tags: [deployment, docker, gotcha, infra, webhook]
sources:
  - "daily/2026-05-13.md"
created: 2026-05-13
updated: 2026-05-13
---

# Webhook Port Bind Mismatch — Code vs Infrastructure Config

When the port a service binds in code differs from the port declared in Dockerfile EXPOSE and docker-compose healthcheck configuration, the container runs but is permanently marked "unhealthy". The service may function (if the correct port is accessible), but Docker's orchestration layer considers it broken.

## Key Points

- `apps/webhook/src/index.ts` bound to port `3002`; `Dockerfile` `EXPOSE 3001` and compose `healthcheck` tested port `3001`
- Container starts, webhook works on 3002, but healthcheck `wget http://localhost:3001/health` always fails
- Docker Compose marks container "unhealthy" after configured retries → compose may restart it automatically or exclude from balancing
- Root cause: port defined in two independent places (application code + infra config) drifted without detection
- Detection: `docker ps` shows `(unhealthy)` status; `docker compose ps` shows health column red

## Details

Docker Compose has three places where a service port must be consistent:

1. **Application code**: `Bun.serve({ port: 3001 })` or equivalent
2. **Dockerfile**: `EXPOSE 3001` (metadata, documents the expected port)
3. **docker-compose.yml**: `healthcheck.test` URL, `ports` mapping, and any `traefik` router labels

In Poputchiki, `apps/webhook/src/index.ts` was changed (or initially written) to bind port `3002`, while the `Dockerfile` and `docker-compose.prod.yml` still referenced `3001`. The container started successfully — the webhook service was functional on port `3002`. However, Docker's healthcheck (`wget -q --spider http://localhost:3001/health`) connected to port `3001`, received `ECONNREFUSED`, and reported failure. After 3 consecutive failures, Docker marked the container "unhealthy".

The "unhealthy" state has operational consequences:
- `depends_on: service_healthy` for any downstream service would block waiting for webhook to become healthy — indefinitely
- Docker Compose's restart policy may restart the container repeatedly, causing brief interruptions
- Monitoring and observability tools that check container health status will alert falsely

The mismatch is silent at development time because `docker-compose.dev.yml` typically doesn't define healthchecks. The issue only surfaces in production where `docker-compose.prod.yml` has strict healthcheck configuration.

Prevention: define the port in exactly one place and derive it everywhere else. The recommended pattern:

```typescript
// apps/webhook/src/env.ts
export const PORT = parseInt(process.env.WEBHOOK_PORT ?? "3001", 10);

// apps/webhook/src/index.ts
import { PORT } from "./env.js";
Bun.serve({ port: PORT });
```

```dockerfile
# Dockerfile — must match default in env.ts
EXPOSE 3001
```

```yaml
# docker-compose.prod.yml
environment:
  WEBHOOK_PORT: "3001"  # single source of truth for production
healthcheck:
  test: ["CMD", "wget", "-q", "--spider", "http://localhost:3001/health"]
```

A pre-deploy audit item: for each service, verify `EXPOSE` in Dockerfile, healthcheck port in compose, and `Bun.serve({ port })` in the application code all agree on the same value.

## Related Concepts

- [[concepts/deployment-pipeline]] - Deploy pipeline that detected the unhealthy container; healthcheck accuracy is a gate for deploy proceed vs rollback
- [[concepts/reactive-deploy-fix-loop]] - Port mismatch is the type of static discrepancy catchable in a pre-deploy audit without deploying
- [[concepts/docker-healthcheck-curl]] - Related healthcheck failure modes; this concept covers tool availability; this article covers port accuracy

## Sources

- [[daily/2026-05-13.md]] - Session 19:16 code review: `apps/webhook/src/index.ts` binds port `3002`; Dockerfile `EXPOSE` and compose healthcheck reference port `3001`; container runs but is permanently `(unhealthy)`; Traefik may route to it despite unhealthy status but orchestration tooling and monitoring are misled; fix: unify port to `3001` across code + Dockerfile + compose
