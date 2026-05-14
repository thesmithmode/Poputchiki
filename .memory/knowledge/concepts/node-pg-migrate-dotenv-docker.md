---
title: "node-pg-migrate --envPath .env Triggers dotenv in Docker"
aliases: [node-pg-migrate-dotenv, envpath-docker, dotenv-docker-unnecessary, migration-dotenv]
tags: [database, docker, gotcha, migration, deployment]
sources:
  - "daily/2026-05-13.md"
created: 2026-05-13
updated: 2026-05-13
---

# node-pg-migrate --envPath .env Triggers dotenv in Docker

`node-pg-migrate` v8 with the `--envPath .env` flag attempts to `require('dotenv')` at startup. In a Docker container where environment variables are injected via `docker-compose.yml` `environment:` section, this flag is unnecessary — and if `dotenv` is not installed as a dependency, the migration command fails immediately with a module-not-found error.

## Key Points

- `--envPath .env` instructs node-pg-migrate to load env vars from a `.env` file via the `dotenv` package
- In Docker, env vars are already set by compose `environment:` or `env_file:` — no `.env` file loading needed
- If `dotenv` is not in `package.json` dependencies: `Error: Cannot find module 'dotenv'` → migration fails → deploy rolls back
- Adding `dotenv` as a dependency fixes the error but is the wrong fix — it adds an unnecessary runtime dependency
- Correct fix: remove `--envPath .env` from the migration command in Docker contexts; keep it only for local development

## Details

The Poputchiki deploy script ran migrations via:

```bash
docker compose run --rm api bun run node-pg-migrate up --envPath .env
```

In the Docker container, `DATABASE_URL` and other required environment variables were already injected via `docker-compose.prod.yml`. The `--envPath .env` flag was a leftover from local development where a `.env` file provides these variables. In Docker, this flag caused node-pg-migrate to attempt loading the `dotenv` package — which was not listed in `package.json` because the project uses Bun's built-in `.env` loading for local dev.

The failure sequence during the 2026-05-13 deployment:
1. First attempt: `--envPath .env` → `Cannot find module 'dotenv'` → migration fails → deploy rolls back
2. Second attempt: added `dotenv` as dependency → `Cannot find module 'dotenv-expand'` (node-pg-migrate v8 also requires it) → migration fails again
3. Third attempt: added `dotenv-expand` → migrations finally run

All three attempts were avoidable: removing `--envPath .env` from the Docker migration command would have worked on the first try. The environment variables were already available via Docker's injection mechanism.

The correct configuration uses two separate commands:
```bash
# Local development (uses .env file)
bun run node-pg-migrate up --envPath .env

# Docker / CI (env already injected)
bun run node-pg-migrate up
```

This is a pattern common to many Node.js CLI tools that support dotenv integration: the flag that loads `.env` files should only be used in environments where the file exists and is the source of truth for configuration.

## Related Concepts

- [[concepts/reactive-deploy-fix-loop]] - The dotenv cascade (3 failed deploys for one fix) was steps 1-3 in the 15-failure production deployment loop
- [[concepts/deployment-pipeline]] - Migration step in deploy.sh where the flag was specified

## Sources

- [[daily/2026-05-13.md]] - Session 14:43: `--envPath .env` in Docker migration command → `dotenv` not installed → fail; then `dotenv-expand` also missing → second fail; correct fix: remove flag entirely in Docker context
