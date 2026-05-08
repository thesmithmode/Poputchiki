FROM oven/bun:1 AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    zstd \
    gnupg \
    curl \
    tini \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY --chown=bun:bun package.json bun.lockb* ./
COPY --chown=bun:bun packages/shared/package.json packages/shared/
COPY --chown=bun:bun apps/cron/package.json apps/cron/
RUN bun install --frozen-lockfile

COPY --chown=bun:bun packages/shared packages/shared
COPY --chown=bun:bun apps/cron apps/cron
COPY --chown=bun:bun scripts scripts

USER bun
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["bun", "run", "apps/cron/src/index.ts"]
