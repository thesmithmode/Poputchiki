FROM oven/bun:1-alpine AS base
WORKDIR /app

RUN apk add --no-cache curl tini

COPY --chown=bun:bun package.json bun.lockb* ./
COPY --chown=bun:bun packages/shared/package.json packages/shared/
COPY --chown=bun:bun apps/notifier/package.json apps/notifier/
RUN bun install --frozen-lockfile

COPY --chown=bun:bun packages/shared packages/shared
COPY --chown=bun:bun apps/notifier apps/notifier

USER bun
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["bun", "run", "apps/notifier/src/index.ts"]
