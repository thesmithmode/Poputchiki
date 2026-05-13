FROM oven/bun:1-alpine AS base
WORKDIR /app

RUN apk add --no-cache curl tini

COPY --chown=bun:bun package.json bun.lockb* ./
COPY --chown=bun:bun packages/shared/package.json packages/shared/
COPY --chown=bun:bun apps/api/package.json apps/api/
COPY --chown=bun:bun web/package.json web/
RUN bun install --frozen-lockfile

COPY --chown=bun:bun packages/shared packages/shared
COPY --chown=bun:bun apps/api apps/api

EXPOSE 3000
USER bun
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["bun", "run", "apps/api/src/index.ts"]
