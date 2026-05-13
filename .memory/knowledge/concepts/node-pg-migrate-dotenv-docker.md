---
title: "node-pg-migrate --envPath Flag Requires dotenv in Docker"
aliases: [node-pg-migrate-dotenv, envPath-docker, pg-migrate-dotenv-flag]
tags: [database, migrations, docker, gotcha, deployment]
sources:
  - "daily/2026-05-13.md"
created: 2026-05-13
updated: 2026-05-13
---

# node-pg-migrate --envPath Flag Requires dotenv in Docker

`node-pg-migrate` v8 with the `--envPath .env` flag attempts to import the `dotenv` package at startup — even in Docker containers where environment variables are already injected by Docker Compose. If `dotenv` is not listed as a dependency, the migration process crashes before running any migrations.

## Key Points

- `--envPath .env` in `node-pg-migrate` command triggers a `require("dotenv")` import regardless of environment
- In Docker, env vars are already present (injected by compose `env_file` or `environment:` block) — `dotenv` is redundant but still required by the flag's code path
- Crash: `Cannot find module 'dotenv'` at migration startup — no migrations run, deploy script treats as failure
- Fix option 1: remove `--envPath` flag entirely (rely on Docker-injected env)
- Fix option 2: add `dotenv` as a prod dependency (`bun add dotenv`)
- `dotenv-expand` is a separate package required if `.env` files use variable expansion (`${VAR}` syntax) — adding `dotenv` alone may not be sufficient

## Details

The `--envPath` flag is designed for local development where `.env` files need to be loaded before running migrations. The intended workflow: developer runs `npx node-pg-migrate --envPath .env up` locally without Docker, and the flag ensures the `.env` file is read. In production Docker containers, this flag is unnecessary because the orchestrator (Docker Compose, Kubernetes) injects environment variables directly into the process environment.

When `--envPath` is present, `node-pg-migrate` v8 unconditionally imports `dotenv` to load the specified file. The import fails at runtime if `dotenv` is not installed:

```
Error: Cannot find module 'dotenv'
Require stack:
- /app/node_modules/.bin/node-pg-migrate
```

The cascade in Poputchiki's 2026-05-13 deployment:
1. Migration command: `node-pg-migrate --envPath .env up` (Docker Compose already sets env)
2. `node-pg-migrate` tries to `require('dotenv')` → crash
3. `dotenv` added as dependency → migration runs → `${DATABASE_URL}` expansion requires `dotenv-expand`
4. `dotenv-expand` added → migrations finally succeed

This is a 2-deploy cascade that could have been avoided by either removing `--envPath` or checking locally with `npx node-pg-migrate --help` to understand which env-loading packages are required.

The correct production migration command in Docker:

```bash
# WRONG: --envPath triggers dotenv import even when env is already injected
node-pg-migrate --envPath .env --database-url $DATABASE_URL up

# CORRECT: no --envPath needed; Docker already has env vars
node-pg-migrate --database-url $DATABASE_URL up
```

A related check: if `DATABASE_URL` uses variable substitution (e.g., `DATABASE_URL=postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@...`), expansion must happen at the shell level before passing to `node-pg-migrate`, not inside a `.env` file processed by `dotenv-expand`.

## Related Concepts

- [[concepts/deployment-pipeline]] - Deploy pipeline where migration command is defined; --envPath flag in deploy.sh caused the dotenv crash
- [[concepts/reactive-deploy-fix-loop]] - The dotenv → dotenv-expand cascade was step 1-2 of the 15-failure production deploy sequence; a pre-deploy CLI audit would have caught it

## Sources

- [[daily/2026-05-13.md]] - Session 14:43: `--envPath .env` flag in node-pg-migrate caused `Cannot find module 'dotenv'` in Docker (env already injected by compose); dotenv added → dotenv-expand also needed; 2-deploy cascade avoidable with local CLI audit; fix: remove `--envPath` flag in production Docker migration commands
