# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────
# Build-Stage: Frontend + Backend bauen
# ─────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build

# Build-Tools für den nativen better-sqlite3-Build (Fallback, falls kein Prebuild)
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Frontend
COPY web/package.json web/package-lock.json ./web/
RUN npm --prefix web ci
COPY web/ ./web/
RUN npm --prefix web run build

# Backend
COPY server/package.json server/package-lock.json ./server/
RUN npm --prefix server ci
COPY server/ ./server/
RUN npm --prefix server run build
# devDependencies entfernen -> schlankes node_modules fürs Runtime-Image
RUN npm --prefix server prune --omit=dev

# ─────────────────────────────────────────────────────────────
# Runtime-Stage: nur das Nötige, ein Prozess (API + Frontend)
# ─────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production

WORKDIR /app/server
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/server/node_modules ./node_modules
COPY --from=build /app/server/package.json ./package.json
COPY --from=build /app/web/dist /app/web/dist
COPY DEFAULTS.md /app/DEFAULTS.md

# Konfiguration (in compose überschreibbar). DB liegt im Volume /data.
ENV PORT=4000 \
    DB_PATH=/data/mediary.db \
    DEFAULTS_PATH=/app/DEFAULTS.md \
    WEB_DIST=/app/web/dist

EXPOSE 4000
VOLUME ["/data"]

CMD ["node", "dist/index.js"]
