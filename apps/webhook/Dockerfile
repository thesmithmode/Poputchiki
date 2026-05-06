FROM oven/bun:1-alpine AS base
WORKDIR /app

COPY package.json bun.lockb* ./
COPY packages/shared/package.json packages/shared/
COPY apps/webhook/package.json apps/webhook/
RUN bun install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/webhook apps/webhook

EXPOSE 3001
CMD ["bun", "run", "apps/webhook/src/index.ts"]
