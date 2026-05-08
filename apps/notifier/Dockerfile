FROM oven/bun:1-alpine AS base
WORKDIR /app

COPY package.json bun.lockb* ./
COPY packages/shared/package.json packages/shared/
COPY apps/notifier/package.json apps/notifier/
RUN bun install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/notifier apps/notifier

CMD ["bun", "run", "apps/notifier/src/index.ts"]
