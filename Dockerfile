FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY server/package*.json ./server/
COPY web/package*.json ./web/

RUN npm --prefix server ci
RUN npm --prefix web ci

COPY server ./server
COPY web ./web
COPY DEFAULTS.md system_prompt.md ./

RUN npm --prefix web run build
RUN npm --prefix server run build
RUN npm --prefix server prune --omit=dev

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates gosu tzdata \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
  PORT=4000 \
  DB_PATH=/data/mediary.db \
  DEFAULTS_PATH=/data/DEFAULTS.md \
  DIARY_PATH=/data/diary.md \
  WEB_DIST=/app/web/dist \
  DREAM_SYSTEM_PROMPT_PATH=/app/system_prompt.md \
  TZ=Europe/Berlin

COPY --from=build /app/server/package.json ./package.json
COPY --from=build /app/server/package-lock.json ./package-lock.json
COPY --from=build /app/server/node_modules ./node_modules
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/web/dist ./web/dist
COPY DEFAULTS.md system_prompt.md ./

RUN mkdir -p /data

EXPOSE 4000

CMD ["sh", "-c", "set -e; mkdir -p /data; if [ ! -f /data/DEFAULTS.md ] && [ -f /app/DEFAULTS.md ]; then cp /app/DEFAULTS.md /data/DEFAULTS.md; fi; if chown -R node:node /data 2>/dev/null && gosu node test -w /data; then exec gosu node node dist/index.js; fi; exec node dist/index.js"]
