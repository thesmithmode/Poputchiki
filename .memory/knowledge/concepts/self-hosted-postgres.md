---
title: "Self-Hosted PostgreSQL (No Supabase)"
aliases: [postgres, self-hosted-db, no-supabase]
tags: [database, architecture, decision]
sources:
  - "daily/2026-05-01.md"
created: 2026-05-01
updated: 2026-05-01
---

# Self-Hosted PostgreSQL (No Supabase)

Poputchiki uses PostgreSQL 16 running in a Docker container (`postgres:16-alpine`) on the customer's own server. Supabase, Neon, and all managed database services are explicitly prohibited.

## Key Points

- Image: `postgres:16-alpine` in Docker Compose
- All managed services are banned: Supabase, Neon, Vercel, Cloudflare Pages, Fly.io, PostHog Cloud
- Supabase-specific functions (`auth.uid()`, `auth.jwt()`) are removed from application code
- RLS is implemented via PostgreSQL GUC variables set by the API layer, not Supabase middleware
- PII encrypted with `pgcrypto pgp_sym_encrypt`; key in `PGCRYPTO_KEY` env variable

## Details

The migration from Supabase to self-hosted was a deliberate architectural decision documented during the 2026-05-01 revision. All documentation (SPEC, PRD, OPEN-QUESTIONS, CLAUDE.md, AUTOMATION.md) was updated to remove Supabase references. The decision was driven by the requirement to keep everything on the customer's private server under their control.

Two Docker Compose files exist: `infra/docker-compose.dev.yml` (local development: postgres + nominatim only) and `infra/docker-compose.prod.yml` (full production stack). A runtime data volume `.docker-data/` is excluded from git via `.gitignore` as a deliberate exception to the project's "commit everything" rule.

The project also runs a self-hosted Nominatim instance (`mediagis/nominatim`) for geocoding, with a region-specific Tatarstan import, reinforcing the self-hosted-everything principle.

## Related Concepts

- [[concepts/rls-guc-identity]] - How RLS works without Supabase's `auth.uid()`
- [[concepts/poputchiki-stack]] - Overall project stack
- [[concepts/deployment-pipeline]] - How the database container is deployed

## Sources

- [[daily/2026-05-01.md]] - Supabase fully replaced by self-hosted PostgreSQL; all docs updated; managed services explicitly banned
