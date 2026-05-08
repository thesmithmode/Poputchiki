FROM oven/bun:1 AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    zstd \
    gnupg \
    curl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json bun.lockb* ./
COPY packages/shared/package.json packages/shared/
COPY apps/cron/package.json apps/cron/
RUN bun install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/cron apps/cron
COPY scripts scripts

CMD ["bun", "run", "apps/cron/src/index.ts"]
