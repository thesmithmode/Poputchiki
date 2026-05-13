---
title: "Traefik Version Pinning — Docker Client API Compatibility"
aliases: [traefik-docker-api, traefik-version-pin, docker-api-compat, traefik-service-discovery-broken]
tags: [docker, traefik, deployment, gotcha, infra]
sources:
  - "daily/2026-05-13.md"
created: 2026-05-13
updated: 2026-05-13
---

# Traefik Version Pinning — Docker Client API Compatibility

Traefik packages a specific Docker client API version at build time. When the host Docker daemon is upgraded and its minimum required API version exceeds Traefik's built-in client version, Traefik loses the ability to discover Docker services — resulting in no routing, no Let's Encrypt certificate issuance, and TLS handshake failures.

## Key Points

- `traefik:v3.3` bundles Docker client API v1.24 — minimum supported by Docker daemon 29.4.3 is v1.40
- Symptom: Traefik starts, but all Docker-label routes are invisible; Let's Encrypt cannot issue certs
- TLS handshake fails through Cloudflare because Traefik has no valid certificate for the domain
- Fix: use `traefik:latest` — always includes a Docker client compatible with recent daemon versions
- The same class of bug applies to any tool that embeds a Docker API client (Portainer, monitoring agents, CI runners)

## Details

Traefik uses the Docker daemon API to discover services by their container labels (e.g., `traefik.enable=true`, `traefik.http.routers.*`). When Traefik starts, it connects to `/var/run/docker.sock` and negotiates the API version. Docker daemon 29.x requires clients to support at minimum API v1.40. Traefik v3.3 was built with a Docker client targeting v1.24. The negotiation fails silently — Traefik starts and reports healthy, but the Docker provider discovers zero services.

The downstream effects cascade:
1. No services discovered → no routing rules → all requests get 404 or connection refused
2. No ACME (Let's Encrypt) resolver can issue certificates because the ACME challenge routes are also not registered
3. Cloudflare proxies requests to the origin → TLS handshake fails because Traefik has no valid cert → Cloudflare returns 502 or SSL error

The failure is deceptive: `docker compose ps` shows Traefik as "running" and its API is reachable on port 8080. The admin dashboard (if enabled) shows the Docker provider connected but with zero discovered services. Only by checking the dashboard or Traefik logs with `--log.level=DEBUG` is the API version incompatibility revealed.

The fix is to stop pinning Traefik to a specific minor version when the underlying Docker daemon may be upgraded independently:

```yaml
# WRONG: pinned to version that may be Docker API incompatible
image: traefik:v3.3

# CORRECT: always use latest stable (Docker client kept up to date)
image: traefik:latest
```

A more controlled alternative is to pin to a recent version after verifying Docker API compatibility: check `docker version` on the host server to get the daemon API version, then verify the Traefik release notes to confirm which Docker client version it bundles. Pinning by digest is also viable for immutable deploys.

The `DOCKER_API_VERSION` environment variable was considered as an override — setting it to `1.54` to match Docker 29's version. This was rejected because it makes the Traefik container's API negotiation forward-only (assumes always compatible with future daemons), whereas `traefik:latest` lets Traefik's own client stay current.

## Related Concepts

- [[concepts/deployment-pipeline]] - The deploy pipeline where Traefik v3.3 incompatibility blocked TLS cert issuance and caused deploy failures
- [[concepts/reactive-deploy-fix-loop]] - Traefik API compat was step 9 in the 15-failure production cascade; caught late because previous failures masked it
- [[concepts/docker-healthcheck-curl]] - Related class: Docker image features (client API version, built-in tools) are not always what you expect from a pinned tag

## Sources

- [[daily/2026-05-13.md]] - Session 19:16: `traefik:v3.3` Docker client 1.24 incompatible with Docker daemon 29.4.3 (minimum 1.40); no service discovery → no TLS → 502 through Cloudflare; fix: `image: traefik:latest`; rejected DOCKER_API_VERSION env var approach as forward-only hack
