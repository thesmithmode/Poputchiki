---
title: "Caddy Alpine — Missing HTTP Modules (Brotli, wget)"
aliases: [caddy-brotli, caddy-alpine-brotli, caddy-encode-br, caddy-wget-missing, caddy-alpine-modules]
tags: [caddy, docker, deployment, gotcha, infra]
sources:
  - "daily/2026-05-13.md"
created: 2026-05-13
updated: 2026-05-13
---

# Caddy Alpine — Missing HTTP Modules (Brotli, wget)

`caddy:2-alpine` is a minimal Alpine-based Caddy image that excludes non-standard HTTP modules. Brotli compression (`http.encoders.br`) is not compiled in, and `wget`/`curl` are absent from the Alpine base. Both omissions cause production failures: Brotli in Caddyfile crashes the process on startup; missing `wget` breaks Docker healthchecks.

## Key Points

- `encode zstd br gzip` in Caddyfile → `unknown encoding: br` → Caddy exits with non-zero code → container restart loop
- `caddy:2-alpine` also has no `curl` or `wget` → `HEALTHCHECK CMD wget ...` always fails → container never becomes "healthy"
- Fix for Brotli: remove `br` from encode directive (`encode zstd gzip`), or use a full Caddy image with Brotli built in
- Fix for healthcheck: `RUN apk add --no-cache wget` in Dockerfile, then use `wget -q --spider http://localhost/`
- Standard Caddy image (`caddy:2`) includes more modules; Alpine variant is stripped for size

## Details

The `caddy:2-alpine` image is built from Alpine Linux and includes only Caddy's standard modules: the HTTP server, file server, reverse proxy, automatic HTTPS, and a few others. Optional compression encoders beyond gzip — specifically Brotli (`http.encoders.br`) and Zstandard — are not guaranteed in the Alpine build. When a Caddyfile directive references an unrecognized module, Caddy fails to parse the config and exits immediately rather than degrading gracefully.

The Brotli failure in Poputchiki:
```
# Caddyfile — WRONG: br not in Alpine image
encode zstd br gzip

# Caddyfile — CORRECT for Alpine
encode zstd gzip
```

The crash is deterministic and immediate: every container start results in Caddy parsing the Caddyfile, encountering `br`, logging `unknown encoding: br`, and exiting with code 1. Docker Compose marks the container as "unhealthy" (or "exited") and the deploy script triggers rollback.

The missing `wget` issue is distinct but related: `caddy:2-alpine` is based on Alpine Linux, which includes BusyBox tools. However, BusyBox `wget` is only available if it was explicitly included in the build. The `caddy:2-alpine` build strips BusyBox to minimize size, so neither `wget` nor `curl` is present. Docker healthchecks that rely on either tool will always exit non-zero.

The correct Dockerfile for Poputchiki's Caddy service:
```dockerfile
FROM caddy:2-alpine
RUN apk add --no-cache wget
COPY Caddyfile /etc/caddy/Caddyfile
```

And the corresponding healthcheck uses `wget` which is now available:
```yaml
healthcheck:
  test: ["CMD", "wget", "-q", "--spider", "http://localhost/"]
  interval: 10s
  timeout: 5s
  retries: 3
```

The broader pattern: Alpine-based images for feature-rich servers (Caddy, nginx, Apache) frequently omit optional modules that are compiled into the "full" variant. Before writing a config that uses a specific module or encoder, verify the module is present: `docker run --rm caddy:2-alpine caddy list-modules | grep encoder`. For base tools like `wget`, verify with `docker run --rm caddy:2-alpine which wget`. Build verification is cheaper than a failed production deploy.

## Related Concepts

- [[concepts/docker-healthcheck-curl]] - Same class: Alpine images missing tools (curl, wget) for healthchecks; caddy:2-alpine confirmed as another affected image
- [[concepts/reactive-deploy-fix-loop]] - Both the Brotli crash (step 8) and missing wget (also step 8) were part of the 15-failure production cascade
- [[concepts/deployment-pipeline]] - web-server (Caddy) container is part of the compose stack; healthcheck accuracy gates deploy proceed vs rollback

## Sources

- [[daily/2026-05-13.md]] - Session 16:48: `caddy:2-alpine` lacks Brotli → `encode zstd br gzip` crashes on startup; also lacks `wget` → healthcheck always fails; fixes: remove `br` from encode directive, `RUN apk add --no-cache wget` in Dockerfile; part of 15-failure deploy cascade
