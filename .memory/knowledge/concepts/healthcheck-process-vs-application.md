---
title: "Process Liveness vs Application Health in Docker Healthchecks"
aliases: [kill-0-healthcheck, process-liveness, healthcheck-pid-only, silent-crash-detection]
tags: [docker, monitoring, healthcheck, gotcha, infra]
sources:
  - "daily/2026-05-13.md"
created: 2026-05-13
updated: 2026-05-13
---

# Process Liveness vs Application Health in Docker Healthchecks

`kill -0 1` (or `kill -0 $PID`) in a Docker healthcheck only verifies that the process exists in the process table. It does not check whether the application is functional — a crashed or deadlocked application that keeps its main process alive will pass this check indefinitely.

## Key Points

- `HEALTHCHECK CMD kill -0 1 || exit 1` passes as long as PID 1 exists — regardless of app state
- A Node.js/Bun process that has entered an unrecoverable error loop but hasn't exited will appear "healthy"
- A deadlocked server (accepting no new connections, processing no requests) will appear "healthy"
- Silent crash: application stops doing its job while the process table still shows it running
- Correct approach: HTTP probe to an actual endpoint (`/health`, `/ping`) that exercises app code

## Details

Docker's healthcheck mechanism runs a command inside the container at regular intervals. If the command exits 0, the container is "healthy"; if it exits non-zero after consecutive failures, it becomes "unhealthy" and Docker may restart it. The healthcheck command must test something meaningful about the application's ability to serve its purpose.

`kill -0 $PID` is the Unix signal 0 trick: signal 0 doesn't actually send a signal, it only checks if the process exists and the caller has permission to signal it. If PID 1 is alive, the command exits 0. This is useful for checking process existence but is a poor proxy for application health.

Failure modes not detected by `kill -0`:

1. **Crashed event loop** — Bun/Node.js can crash internally (SIGSEGV, uncaught exception in async context) without killing the process. The process table shows the process alive; the HTTP server is no longer accepting connections.

2. **Connection pool exhaustion** — all pool connections are held, new requests queue indefinitely. The process is alive; requests time out.

3. **Memory pressure** — process is alive but severely degraded due to GC pressure or memory leak.

4. **Dependency failures** — application cannot connect to database or redis; all handlers return 500s. Process is alive.

For `notifier` and `cron` services in Poputchiki, `kill -0 1` was used because they don't expose HTTP endpoints. The correct approach per service type:

```yaml
# API/notifier/webhook — HTTP health endpoint
healthcheck:
  test: ["CMD", "wget", "-q", "--spider", "http://localhost:3001/health"]
  interval: 30s
  timeout: 10s
  retries: 3

# Cron — check sentinel file or last-run timestamp
healthcheck:
  test: ["CMD", "sh", "-c", "find /tmp/cron-alive -mmin -5 2>/dev/null | grep -q ."]
  interval: 60s
  timeout: 5s
  retries: 3

# Background worker (if no HTTP) — check custom IPC or log file timestamp
healthcheck:
  test: ["CMD", "sh", "-c", "test $(date +%s) -lt $(( $(stat -c %Y /tmp/heartbeat) + 120 ))"]
```

For cron-style services, the application can `touch /tmp/cron-alive` after each job run. The healthcheck verifies the file was modified within the expected interval. If the cron stops processing jobs but the process lives, the file goes stale and the healthcheck fails.

The `kill -0 1` pattern is acceptable only when: (1) process death is the only meaningful failure mode (e.g., a simple proxy with no state), AND (2) the service will definitely exit on any meaningful error (no silent failure modes). For Bun/Node.js services with async event loops, neither condition holds.

## Related Concepts

- [[concepts/docker-healthcheck-curl]] - Related: tool availability for healthcheck commands; `wget`/`curl` must be installed for HTTP probes
- [[concepts/deployment-pipeline]] - Healthcheck results gate the deploy proceed/rollback decision; false-healthy means broken services stay deployed
- [[concepts/reactive-deploy-fix-loop]] - Silent healthcheck failures contributed to the deploy cascade; inadequate liveness checks mask real problems

## Sources

- [[daily/2026-05-13.md]] - Session 19:16 code review: `notifier` and `cron` containers used `kill -0 1` healthcheck → only checks PID, not application function; silent crash (process alive, app dead) not detected; fix: HTTP probe for services with endpoints, sentinel file for background workers
