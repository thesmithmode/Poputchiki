FROM oven/bun:1-alpine AS base
WORKDIR /app

COPY package.json bun.lockb* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN bun install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/api apps/api

EXPOSE 3000
CMD ["bun", "run", "apps/api/src/index.ts"]
