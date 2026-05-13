FROM oven/bun:1 AS builder
WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json bun.lockb* tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY web/package.json web/
RUN bun install --frozen-lockfile

# Copy sources
COPY packages/shared packages/shared
COPY docs docs
COPY web web

ARG VITE_API_BASE
ENV VITE_API_BASE=${VITE_API_BASE}
RUN cd web && bun run build

FROM caddy:2-alpine
ARG DOMAIN
ENV DOMAIN=${DOMAIN}
COPY apps/web-server/Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/web/dist /srv
EXPOSE 80
