---
title: "Webhook Port Bind Mismatch (App 3002 vs Dockerfile 3001)"
aliases: [port-mismatch, webhook-port, expose-mismatch, healthcheck-port-wrong]
tags: [docker, deployment, gotcha, infra]
sources:
  - "daily/2026-05-13.md"
created: 2026-05-13
updated: 2026-05-13
---

# Webhook Port Bind Mismatch (App 3002 vs Dockerfile 3001)

When the application binds to one port and the Dockerfile EXPOSE directive, compose healthcheck, and Traefik labels reference a different port, the container runs but is permanently marked "unhealthy". The application works internally but is invisible to orchestration and health monitoring.

## Key Points

- `apps/webhook/src/index.ts` binds `Bun.serve({ port: 3002 })` — the actual listening port
- `Dockerfile` contains `EXPOSE 3001` — documentation-only but signals intent
- `docker-compose.prod.yml` healthcheck probes `http://localhost:3001/health` — always fails (nothing on 3001)
- Container status: `running (unhealthy)` indefinitely — process alive, health check never passes
- Fix: align all three (app code, Dockerfile EXPOSE, compose healthcheck) to the same port

## Details

Docker's `EXPOSE` directive is purely informational — it does not actually publish the port or affect which port the application listens on. However, it signals the intended port to operators and tooling. When the application's actual bind port diverges from EXPOSE and from the compose healthcheck target, a silent failure occurs.

In Poputchiki, the webhook service was configured as:

```typescript
// apps/webhook/src/index.ts
Bun.serve({ port: 3002, fetch: app.fetch });
```

```dockerfile
# Dockerfile
EXPOSE 3001
```

```yaml
# docker-compose.prod.yml
webhook:
  healthcheck:
    test: ["CMD", "wget", "-q", "--spider", "http://localhost:3001/health"]
```

The healthcheck probes port 3001, but the application listens on 3002. Every healthcheck attempt fails with "Connection refused". Docker marks the container as unhealthy after the retry count is exhausted. If other services or Traefik depend on the webhook being healthy, they may refuse to route traffic to it.

The fix is a single-source-of-truth approach: define the port in one place (environment variable or constant) and reference it from all three locations:

```yaml
# docker-compose.prod.yml
webhook:
  environment:
    - PORT=3002
  healthcheck:
    test: ["CMD", "wget", "-q", "--spider", "http://localhost:3002/health"]
```

The pre-deploy audit checklist should include: for each service, verify that the port in `Bun.serve()` / `app.listen()` matches both the Dockerfile EXPOSE and the compose healthcheck test command. This check is static and can be done without deploying.

## Related Concepts

- [[concepts/healthcheck-process-vs-application]] - Related healthcheck failure mode: process alive but healthcheck wrong — both result in "unhealthy" status for different reasons
- [[concepts/reactive-deploy-fix-loop]] - Port mismatch was finding #5 in the code review; part of the pre-deploy audit that would prevent reactive fix loops
- [[concepts/deployment-pipeline]] - Webhook is one of 5 services in the compose stack; healthcheck accuracy gates deploy decisions

## Sources

- [[daily/2026-05-13.md]] - Session 19:16 code review finding #5: webhook app binds port 3002, Dockerfile EXPOSE and compose healthcheck reference 3001 → container permanently unhealthy despite working application; fix: align all three to same port
