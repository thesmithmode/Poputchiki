---
title: "Nominatim PBF Region Sizing and Import Dependency Strategy"
aliases: [nominatim-pbf, osm-pbf-size, nominatim-import, service-started-vs-healthy, geofabrik-region]
tags: [nominatim, docker, infra, deployment, geocoding]
sources:
  - "daily/2026-05-16.md"
created: 2026-05-16
updated: 2026-05-16
---

# Nominatim PBF Region Sizing and Import Dependency Strategy

Self-hosted Nominatim requires an OpenStreetMap PBF data file for the geographic region to index. Choosing the minimum sufficient region dramatically reduces import time and storage. Services that depend on Nominatim must use `condition: service_started` (not `service_healthy`) because Nominatim's initial OSM import can take 10-20 minutes — a healthcheck-based wait would block dependent services for the entire import duration.

## Key Points

- `russia-latest.osm.pbf` or `volga-fed-district.osm.pbf` (~700MB) is 10× oversized if only Kazan/Tatarstan coverage is needed
- `tatarstan-latest.osm.pbf` from Geofabrik (~80MB) imports in 10-20 minutes on modest hardware — sufficient for ЖК Царёво coverage
- `depends_on: nominatim: condition: service_healthy` blocks the API container until Nominatim is healthy — potentially 20+ minutes on first deploy with an empty volume
- `depends_on: nominatim: condition: service_started` lets the API start immediately; geocoding requests fail gracefully until Nominatim finishes importing
- Rate limit for self-hosted Nominatim can be raised to 10 rps (vs 1 rps for public `nominatim.openstreetmap.org`) since it's your own infrastructure
- `NOMINATIM_URL` env var must be set to `http://nominatim:8080` in prod and `http://localhost:8088` (or similar) locally

## Details

Nominatim is a geocoding engine based on OpenStreetMap data. It indexes a `.pbf` file (Protocolbuffer Binary Format) during startup — a one-time import that takes minutes to hours depending on region size and hardware. The `mediagis/nominatim` Docker image accepts a `PBF_URL` environment variable pointing to a Geofabrik download URL and performs the import on first start (similar to PostgreSQL's init-once behavior for data volumes).

**PBF region selection strategy:** Geofabrik provides extracts at multiple geographic levels. For Poputchiki (Kazan, Tatarstan):

| PBF | Size | Import time | Contains |
|-----|------|-------------|---------|
| `russia-latest` | ~3.5GB | 2-4 hours | All of Russia |
| `volga-fed-district` | ~700MB | 30-60 min | Tatarstan + 14 other regions |
| `tatarstan-latest` | ~80MB | 10-20 min | Only Tatarstan |

The minimum-sufficient region is always preferred. `tatarstan-latest` covers all addresses in Kazan and ЖК Царёво without the overhead of 14 extra regions.

**The `service_started` vs `service_healthy` choice:**

```yaml
# docker-compose.prod.yml
services:
  api:
    depends_on:
      postgres:
        condition: service_healthy   # postgres must be ready before API starts
      nominatim:
        condition: service_started   # nominatim just needs to be running; import happens async
  nominatim:
    image: mediagis/nominatim:4.4
    environment:
      PBF_URL: https://download.geofabrik.de/russia/tatarstan-latest.osm.pbf
      REPLICATION_URL: ""
```

Using `service_healthy` for Nominatim would require the API to wait for Nominatim's healthcheck to pass — which only happens after the full OSM import completes. On first deploy (empty volume), this would block the API for 10-20 minutes. With `service_started`, the API starts immediately, geocoding requests return errors or fall back to a degraded mode until Nominatim finishes importing, and subsequent deploys (non-empty volume) start Nominatim instantly (no re-import needed).

The geocoding API should handle Nominatim unavailability gracefully — returning a 503 or an empty result set rather than crashing. This allows the rest of the app to function during the import window.

## Related Concepts

- [[concepts/docker-compose-profiles-silent-skip]] — The profiles trap that prevented Nominatim from starting at all; this article covers what to do once it's correctly in the stack
- [[concepts/postgres-volume-init-idempotency]] — Same pattern: Docker service init runs once on empty volume; Nominatim OSM import is also a one-time-per-volume operation
- [[concepts/docker-compose-run-skips-healthcheck]] — Related dependency condition handling; `service_started` vs `service_healthy` is a recurring Docker Compose subtlety
- [[concepts/deployment-pipeline]] — Nominatim is now a permanent member of the prod compose stack

## Sources

- [[daily/2026-05-16.md]] — Session 15:43: Nominatim `profiles: [nominatim]` removed; PBF changed from `volga-fed-district` (~700MB) to `tatarstan-latest` (~80MB); `depends_on nominatim: condition: service_started` chosen to avoid blocking API during 20-min import; rate limit raised to 10 rps for self-hosted; task spec for Nominatim integration written for separate agent
