---
title: "Healthcheck Process vs Application — kill -0 Is Not Enough"
aliases: [kill-0-healthcheck, pid-healthcheck, process-healthcheck, silent-crash-detection]
tags: [docker, healthcheck, gotcha, infra, deployment]
sources:
  - "daily/2026-05-13.md"
created: 2026-05-13
updated: 2026-05-13
---

# Healthcheck Process vs Application — kill -0 Is Not Enough

`kill -0 1` in a Docker healthcheck only verifies that PID 1 exists — it does not verify that the application inside the process is functioning. A process can be alive (consuming CPU, holding a socket) while the application layer has crashed, deadlocked, or entered an unrecoverable state. The healthcheck reports "healthy" while the service is silently broken.

## Key Points

- `kill -0 <pid>` checks only that the process exists and is signalable — not that it's doing useful work
- A Node.js/Bun process can be alive with an unhandled rejection loop, exhausted event loop, or crashed HTTP listener
- Docker marks the container "healthy" → dependent services start → they fail connecting to a dead application
- Fix: replace `kill -0 1` with an HTTP probe (`wget -q --spider http://localhost:PORT/health`) or a TCP check
- If no HTTP endpoint exists, use a sentinel file that the application touches periodically; healthcheck verifies file freshness

## Details

The Poputchiki `notifier` and `cron` services used `HEALTHCHECK CMD kill -0 1` in their Docker Compose configuration. This command sends signal 0 to PID 1 (the container's main process). Signal 0 does not actually send a signal — it only checks that the process exists and the caller has permission to signal it. If the process is running, `kill -0` exits with 0 (success); if the process has terminated, it exits with non-zero.

The failure mode: the Bun runtime process (PID 1) is alive, but the HTTP server within it has crashed due to an unhandled exception, a port conflict, or a dependency failure (e.g., PostgreSQL connection pool exhausted). The process itself continues running (Bun's event loop is still active), but it serves no requests. `kill -0 1` returns success. Docker reports "healthy". The deploy script proceeds without rollback. Users experience a completely broken service with no alerts.

For services with an HTTP endpoint, the fix is straightforward:

```yaml
healthcheck:
  test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/health"]
  interval: 10s
  timeout: 5s
  retries: 3
```

For background workers without HTTP endpoints (like `cron`), two alternatives exist:

1. **Add a minimal health endpoint**: Even a cron service can bind a port and respond to `/health` with 200 if its scheduler is running.
2. **Sentinel file pattern**: The application writes a timestamp to `/tmp/healthcheck` every N seconds; the healthcheck reads it and fails if the timestamp is older than 2×N seconds.

```yaml
# Sentinel file approach for cron/worker services
healthcheck:
  test: ["CMD-SHELL", "test $(( $(date +%s) - $(stat -c %Y /tmp/healthcheck 2>/dev/null || echo 0) )) -lt 60"]
  interval: 30s
  timeout: 5s
  retries: 3
```

The sentinel approach catches deadlocks and event loop exhaustion that HTTP probes might miss — if the application stops writing the sentinel, the healthcheck fails even if the process is alive.

## Related Concepts

- [[concepts/docker-healthcheck-curl]] - Related healthcheck gotcha: Alpine images missing wget/curl for HTTP probes
- [[concepts/deploy-single-healthcheck-window]] - Healthcheck accuracy determines whether deploy timeout is a true failure or false positive
- [[concepts/deployment-pipeline]] - Healthcheck results gate the deploy proceed/rollback decision

## Sources

- [[daily/2026-05-13.md]] - Session 19:16 code review finding #6: notifier/cron using `kill -0 1` → only checks PID, not application health; silent crash not detectable; recommended HTTP probe or sentinel file replacement
