# meDiary — Development & Verification

> Part of the meDiary project docs — overview & index in [CLAUDE.md](../CLAUDE.md).

## Quickstart & commands

```bash
npm run install:all    # install server/ and web/
npm --prefix server run seed     # 6 substances + 2 plan versions + intakes
npm run dev            # API :4000, web :5173 (proxy /api → 4000)
```

Additional commands (no linter configured, no test runner — verification
see recipes below):

```bash
npm --prefix server run build    # tsc → server/dist
npm run start                    # node dist/index.js (build first)
npm run build:web                # tsc --noEmit + vite build → web/dist
npm run build                    # build web + server
npm --prefix server run import               # importer dry run (reads import/)
npm --prefix server run import -- --commit   # writes to the DB (--reset-imported replaces imported data)
npm run cap:android              # Capacitor: create android/ + sync (in web/: cap:sync, cap:open)
```

Server configuration via env / `.env` (`server/src/config.ts`): `PORT` (4000),
`DB_PATH`, `DEFAULTS_PATH`, `WEB_DIST`. Defaults (when no env is set):
- `DB_PATH` → `~/.local/share/mediary/data/mediary.db`
- `DEFAULTS_PATH` → `~/.local/share/mediary/DEFAULTS.md`
- `WEB_DIST` → not set (API runs solo)

**`.env` file:** template in `.env.example`. Docker Compose reads `.env`
optionally; for local Node starts the server additionally loads `server/.env`
via `dotenv`. `.env` is in `.gitignore`.

**Docker deployment:**
```bash
docker compose up -d --build
docker compose logs -f mediary
```

The production DB lives under `./data/mediary.db` in the repo root. This
directory is the live data directory and must not be used for tests.

## Verification recipes (what to check after changes)

After every change to server or import logic:

```bash
# 1. Build + typecheck
cd server && npx tsc --noEmit        # must exit 0
cd ../web && npx tsc --noEmit        # must exit 0

# 2. E2E smoke against a scratch DB in /tmp — never against ./data in the
#    project root (Docker volume with live data) or server/data!
cd ../server && rm -rf /tmp/mediary-test && mkdir -p /tmp/mediary-test
PORT=4011 DB_PATH=/tmp/mediary-test/mediary.db DEFAULTS_PATH=../DEFAULTS.md node_modules/.bin/tsx src/seed.ts
PORT=4011 DB_PATH=/tmp/mediary-test/mediary.db DEFAULTS_PATH=../DEFAULTS.md node_modules/.bin/tsx src/index.ts &

# DEFAULTS compliance:
curl -sS http://localhost:4011/api/defaults/check | jq

# Auto-vivification: create an intake with a new name
curl -sS -X POST http://localhost:4011/api/intakes -H 'Content-Type: application/json' \
  -d '{"substanceName":"Mirtazapin","amount":"15 mg"}'
# → createdSubstance: true, new substance in /api/substances listing

# DEFAULTS takes effect:
curl -sS -X POST http://localhost:4011/api/intakes -H 'Content-Type: application/json' \
  -d '{"substanceId":<id-of-cbd-öl>}'
# → notes are applied from DEFAULTS.md

# Retroactive / future plan version:
curl -sS -X PUT http://localhost:4011/api/plan -H 'Content-Type: application/json' \
  -d '{"effectiveFrom":"<yesterday>","note":"retroactive","items":[{"substanceName":"Lithium","strength":"600 mg"}]}'
# → immediately current plan; with effectiveFrom in the future instead:
#   GET /api/plan → old version + upcoming[], GET /api/plan/at?date=<future> → new version

# Free-text import (start the server with CF_ACCESS_DISABLED=true for this):
curl -sS -X POST http://localhost:4011/api/intakes/text -H 'Content-Type: application/json' \
  -d '{"text":"11.06.2026 08:30: Elvanse 30mg (nüchtern), Lithium 300 mg und Vitamin D 20000 IE\njetzt: Theanin"}'
# → 201, verified:true, entries[] with entries freshly read from the DB;
#   dryRun:true in the body only parses. Without CF_ACCESS_DISABLED / config → 503,
#   with CF_ACCESS_TEAM_DOMAIN+CF_ACCESS_AUD but without/with invalid JWT → 401.

# 3. Frontend build
cd ../web && node_modules/.bin/vite build   # dist/ is created
```
