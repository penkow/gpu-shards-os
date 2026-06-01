# Frontend panel — Next.js 16 production build served by `next start`.
#
# Multi-stage to keep the runtime image lean(ish): deps → builder → runner.
# Build context: ./frontend (see docker-compose.yml).
# syntax=docker/dockerfile:1.6

# ---- deps ---------------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# ---- builder ------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runner -------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# tar — used by the /source.tar.gz route to stream the project tree.
# tini — PID-1 init for clean signals under docker compose.
RUN apk add --no-cache tar tini

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json* ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
