---
title: "Docker Compose profiles: Key — Silent Service Skip"
aliases: [compose-profiles, profiles-silent-skip, nominatim-profiles, docker-profiles-trap]
tags: [docker, gotcha, infra, deployment]
sources:
  - "daily/2026-05-16.md"
created: 2026-05-16
updated: 2026-05-16
---

# Docker Compose profiles: Key — Silent Service Skip

A Docker Compose service with a `profiles:` key does not start with `docker compose up` unless that profile is explicitly activated via `--profile <name>` or `COMPOSE_PROFILES` env var. The service definition exists in the compose file and appears in `docker compose config`, but the container never starts. Code that falls back to a public API endpoint will do so silently — no error, no log line indicating the local service is absent.

## Key Points

- `profiles: [nominatim]` in a service definition → service skipped by `docker compose up` / `docker compose up -d`
- No error or warning when a profiled service is absent — dependent services start normally and call the fallback
- Poputchiki API was calling `nominatim.openstreetmap.org` (public, rate-limited, ToS-restricted) instead of self-hosted because Nominatim had `profiles: [nominatim]` and was never started
- Fix: remove `profiles:` entirely to make the service always part of the stack, OR add `--profile nominatim` to all `docker compose` invocations in deploy scripts
- `docker compose ps` does not list profiled services that are not active — must check compose config to discover them

## Details

The `profiles` feature in Docker Compose is intended for services that should only run in specific environments (e.g., a debug tool only in dev, or a heavy service only in prod). When profiles are used, the operator must explicitly opt in: `docker compose --profile nominatim up`. A service with `profiles: [nominatim]` is completely invisible to standard `docker compose up` invocations.

In Poputchiki, the Nominatim service was present in `docker-compose.prod.yml` with `profiles: [nominatim]` from early architectural work. The production deploy script used plain `docker compose up -d`, so Nominatim never started. The geocoding API code was configured to fall back to `https://nominatim.openstreetmap.org` when the self-hosted URL was unreachable — but since the env var `NOMINATIM_URL` might have been set to `http://nominatim:8080`, the call failed silently and the fallback fired without any log entry distinguishing "using public API" from "using self-hosted API".

Discovery sequence: user noticed that address search results were returning locations from the city center rather than the ЖК Царёво area (a bounding box / geocoding accuracy issue). SSH inspection of the production server showed no `nominatim` container in `docker compose ps` output. Checking `docker-compose.prod.yml` revealed the `profiles:` key.

**Diagnosing a silent profiles issue:**

```bash
# Shows ALL services in the compose file including profiled ones
docker compose config --services

# Shows only RUNNING services (profiled but inactive services absent)
docker compose ps --services

# Diff between the two = profiled services that aren't running
```

The fix for Poputchiki: remove `profiles: [nominatim]` from the Nominatim service definition and update the PBF source to `tatarstan-latest.osm.pbf` (~80MB) instead of the much larger `volga-fed-district` (~700MB). The service becomes a permanent part of the prod stack.

Related: `depends_on` for the API service must use `condition: service_started` (not `service_healthy`) for Nominatim, because Nominatim's OSM import takes 10-20 minutes — `service_healthy` would block the API from starting for the duration of the first import.

## Related Concepts

- [[concepts/deployment-pipeline]] — Deploy script uses `docker compose up -d`; profiled services are silently absent from this invocation
- [[concepts/nominatim-pbf-region-sizing]] — PBF region selection for the self-hosted Nominatim that was affected by this profiles trap
- [[concepts/docker-compose-run-skips-healthcheck]] — Related Docker Compose behavioral surprise: `run` ignores healthcheck conditions just as `up` ignores profiled services

## Sources

- [[daily/2026-05-16.md]] — Session 15:43: Nominatim had `profiles: [nominatim]` → not started by `docker compose up` → API silently using public `nominatim.openstreetmap.org`; fix: remove profiles key, always start as part of prod stack; PBF changed to tatarstan-latest (~80MB)
