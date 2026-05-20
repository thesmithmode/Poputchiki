FROM oven/bun:1-alpine AS base
# M10: заменён базовый образ oven/bun:1 (Debian ~800MB) на alpine (~150MB).
# apk: postgresql16-client совместим с pg_dump против Postgres 16.
RUN apk add --no-cache postgresql16-client zstd gnupg curl tini
WORKDIR /app

COPY --chown=bun:bun package.json bun.lockb* ./
COPY --chown=bun:bun packages/shared/package.json packages/shared/
COPY --chown=bun:bun apps/cron/package.json apps/cron/
COPY --chown=bun:bun web/package.json web/
RUN bun install --frozen-lockfile

COPY --chown=bun:bun packages/shared packages/shared
COPY --chown=bun:bun apps/cron apps/cron
COPY --chown=bun:bun scripts scripts

USER bun
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["bun", "run", "apps/cron/src/index.ts"]
